import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import {
  abortAllActiveRequests,
  clearAllInDoubtSubmissions,
  getInDoubtSubmission,
  setInDoubtSubmission,
} from '../lib/review-in-doubt-store.js';
import type { OrderReviewItemContext } from '../types.js';
import { OrderReviewItem } from './OrderReviewItem.js';

const mockAuthenticatedRequest = vi.fn();
let currentAuth = {
  user: { id: 'user-1' } as { id: string } | null,
  authenticatedRequest: mockAuthenticatedRequest,
  getSessionEpoch: () => 1,
};

vi.mock('@/features/account', () => ({
  useAuth: () => currentAuth,
}));

function renderWithClient(ui: React.ReactElement, client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('OrderReviewItem', () => {
  const onReviewSubmitted = vi.fn();
  const onRetryContext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearAllInDoubtSubmissions();
    currentAuth = {
      user: { id: 'user-1' },
      authenticatedRequest: mockAuthenticatedRequest,
      getSessionEpoch: () => 1,
    };
  });

  it('hien thi thong tin danh gia khi dong hang da duoc danh gia', () => {
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: false,
      reasonCode: 'ALREADY_REVIEWED',
      review: {
        id: 'rev-1',
        rating: 5,
        content: 'Chất lượng rất tốt',
        moderationStatus: 'PENDING',
        createdAt: '2026-11-12T00:00:00Z',
        updatedAt: '2026-11-12T00:00:00Z',
      },
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    expect(screen.getByText(/5\/5 sao/)).toBeInTheDocument();
    expect(screen.getByText('Chất lượng rất tốt')).toBeInTheDocument();
    expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument();
  });

  it('hien thi ly do don hang chua giao khi NOT_DELIVERED', () => {
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: false,
      reasonCode: 'NOT_DELIVERED',
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    expect(
      screen.getByText('Chưa đủ điều kiện đánh giá (đơn hàng chưa giao thành công)'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('hien thi ly do da duoc danh gia khi ALREADY_REVIEWED ma khong co review object', () => {
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: false,
      reasonCode: 'ALREADY_REVIEWED',
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    expect(screen.getByText('Sản phẩm đã được đánh giá')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('hien thi nut "Viết đánh giá" khi dong hang du dieu kien', () => {
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    const button = screen.getByRole('button', { name: 'Viết đánh giá' });
    expect(button).toBeInTheDocument();
  });

  it('mo form danh gia, chon sao va gui thanh cong', async () => {
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    mockAuthenticatedRequest.mockResolvedValueOnce({
      id: 'rev-new',
      orderItemId: 'item-1',
      productId: 'prod-1',
      rating: 5,
      content: 'Rất ưng ý',
      moderationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    });

    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    // 1. Click Mo form
    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));

    // Nut submit ban dau bi disable vi chua chon sao
    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' });
    expect(submitBtn).toBeDisabled();

    // 2. Chon 5 sao
    const radio5 = screen.getByLabelText('5 sao');
    fireEvent.click(radio5);
    expect(submitBtn).not.toBeDisabled();

    // 3. Nhap content
    const textarea = screen.getByPlaceholderText('Chia sẻ trải nghiệm sử dụng sản phẩm...');
    fireEvent.change(textarea, { target: { value: 'Rất ưng ý' } });

    // 4. Submit form
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        '/reviews',
        expect.objectContaining({
          method: 'POST',
          body: {
            orderItemId: 'item-1',
            rating: 5,
            content: 'Rất ưng ý',
          },
        }),
      );
      expect(onReviewSubmitted).toHaveBeenCalled();
    });

    // Marker in-doubt da duoc xoa sau khi thanh cong
    expect(getInDoubtSubmission('user-1', 'item-1')).toBeUndefined();
  });

  // --- Regression P2 #1: Freeze original payload on unknown POST outcome ---
  it('must freeze original payload when POST result is unknown (Codex reproduce case)', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('Network timeout'));

    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item1',
      productVariantId: 'v1',
      productId: 'p1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'original review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network timeout'));
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByLabelText('5 sao')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeEnabled();

    // Marker in-doubt da duoc luu voi dung payload goc
    const inDoubt = getInDoubtSubmission('user-1', 'item1');
    expect(inDoubt).toBeDefined();
    expect(inDoubt?.rating).toBe(5);
    expect(inDoubt?.content).toBe('original review');
    expect(inDoubt?.status).toBe('unknown_error');
  });

  it('timeout chua commit: cho phep replay nguyen payload goc va thanh cong khi mang on dinh', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('Network timeout'));

    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-timeout',
      productVariantId: 'v-timeout',
      productId: 'p-timeout',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-timeout"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('4 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Thử gửi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network timeout'));
    expect(screen.getByRole('textbox')).toBeDisabled();

    // Replay: server tra ve 201
    mockAuthenticatedRequest.mockResolvedValueOnce({
      id: 'rev-replayed',
      orderItemId: 'item-timeout',
      productId: 'p-timeout',
      rating: 4,
      content: 'Thử gửi',
      moderationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    });

    const replayBtn = screen.getByRole('button', { name: 'Gửi lại' });
    fireEvent.click(replayBtn);

    await waitFor(() => {
      expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(2);
      expect(mockAuthenticatedRequest).toHaveBeenLastCalledWith(
        '/reviews',
        expect.objectContaining({
          method: 'POST',
          body: {
            orderItemId: 'item-timeout',
            rating: 4,
            content: 'Thử gửi',
          },
        }),
      );
      expect(onReviewSubmitted).toHaveBeenCalled();
    });

    expect(getInDoubtSubmission('user-1', 'item-timeout')).toBeUndefined();
  });

  it('timeout sau commit: doi chieu row hien co tu context GET se giai toa marker', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('Network timeout'));

    const itemContextWithoutReview: OrderReviewItemContext = {
      orderItemId: 'item-committed',
      productVariantId: 'v-c',
      productId: 'p-c',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-c"
        itemContext={itemContextWithoutReview}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Committed review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network timeout'));
    expect(getInDoubtSubmission('user-1', 'item-committed')).toBeDefined();

    // Context GET tra ve review da duoc server ghi nhan
    const itemContextWithReview: OrderReviewItemContext = {
      ...itemContextWithoutReview,
      eligible: false,
      reasonCode: 'ALREADY_REVIEWED',
      review: {
        id: 'rev-committed',
        rating: 5,
        content: 'Committed review',
        moderationStatus: 'PENDING',
        createdAt: '2026-11-12T00:00:00Z',
        updatedAt: '2026-11-12T00:00:00Z',
      },
    };

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <OrderReviewItem
          orderId="order-c"
          itemContext={itemContextWithReview}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    // Marker duoc giai toa tu dong vi row da co tren server
    await waitFor(() => {
      expect(screen.getByText('Committed review')).toBeInTheDocument();
      expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument();
    });
    expect(getInDoubtSubmission('user-1', 'item-committed')).toBeUndefined();
  });

  it('remount va GC cache van bao luu marker va khoa payload khong cho phep sua payload B', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('504 Gateway Timeout'));

    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-gc',
      productVariantId: 'v-gc',
      productId: 'p-gc',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const client1 = new QueryClient({
      defaultOptions: { queries: { gcTime: 0 }, mutations: { retry: false } },
    });
    const { unmount } = renderWithClient(
      <OrderReviewItem
        orderId="order-gc"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client1,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Payload A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('504 Gateway Timeout'));

    // Component unmount (nguoi dung roi trang, hoac cache bi GC sau >5 phut)
    unmount();
    client1.clear();

    // Remount voi QueryClient hoan toan moi
    const client2 = new QueryClient();
    renderWithClient(
      <OrderReviewItem
        orderId="order-gc"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client2,
    );

    // Payload A van duoc bao toan, form mo san o trang thai freeze va khong cho sua
    expect(screen.getByDisplayValue('Payload A')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByLabelText('5 sao')).toBeChecked();
    expect(screen.getByLabelText('5 sao')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeEnabled();
  });

  it('doi actor/phien va response den muon: khong lam anh huong phien moi', async () => {
    let rejectPromise!: (err: Error) => void;
    mockAuthenticatedRequest.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPromise = reject;
        }),
    );

    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-late',
      productVariantId: 'v-late',
      productId: 'p-late',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    renderWithClient(
      <OrderReviewItem
        orderId="order-late"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Session 1 payload' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());

    // User doi phien / dang xuat / chuyen sang user-2 voi epoch 2
    currentAuth = {
      user: { id: 'user-2' },
      authenticatedRequest: mockAuthenticatedRequest,
      getSessionEpoch: () => 2,
    };

    // Late response tu phien 1 tra ve sau khi doi phien
    rejectPromise(new Error('Late network error'));

    await waitFor(() => {
      // Phien moi khong so huu marker cua user-1
      expect(getInDoubtSubmission('user-2', 'item-late')).toBeUndefined();
    });
  });

  // --- Regression P2 #2: Context loading & Error handling ---
  it('hien thi loading khi context dang tai va chua co du lieu', () => {
    renderWithClient(
      <OrderReviewItem
        orderId="order-loading"
        loading={true}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    expect(screen.getByText('Đang kiểm tra điều kiện đánh giá…')).toBeInTheDocument();
  });

  it('hien thi thong bao loi va nut Thu lai khi GET context loi', () => {
    renderWithClient(
      <OrderReviewItem
        orderId="order-err"
        contextError={new Error('Lỗi kết nối máy chủ')}
        onRetryContext={onRetryContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(onRetryContext).toHaveBeenCalled();
  });

  // --- Regression P2 (Round 2): Marker Lifecycle & In-Flight / Conflict Recovery ---
  it('restored in_flight after reload must offer a recovery action', () => {
    setInDoubtSubmission({
      actorId: 'user-1',
      orderItemId: 'item-1',
      rating: 5,
      content: 'A',
      sessionEpoch: 1,
      submittedAt: Date.now() - 600000,
      status: 'in_flight',
    });
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'v1',
      productId: 'p1',
      eligible: true,
      reasonCode: null,
      review: null,
    };
    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );
    expect(screen.getByRole('button', { name: 'Gửi lại' })).toBeEnabled();
  });

  it('replay 409 must not leave an in_flight marker after the request settles', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('timeout'));
    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-1',
      productVariantId: 'v1',
      productId: 'p1',
      eligible: true,
      reasonCode: null,
      review: null,
    };
    renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    await screen.findByRole('button', { name: 'Gửi lại' });

    mockAuthenticatedRequest.mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Review exists',
        path: '/reviews',
        timestamp: '',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Review exists'));
    expect(getInDoubtSubmission('user-1', 'item-1')?.status).not.toBe('in_flight');
  });

  it('remount voi request con song: hien thi dang gui, disable thao tac va cap nhat khi resolve', async () => {
    let resolvePromise!: (val: unknown) => void;
    mockAuthenticatedRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const itemContext: OrderReviewItemContext = {
      orderItemId: 'item-live',
      productVariantId: 'v-live',
      productId: 'p-live',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { unmount } = renderWithClient(
      <OrderReviewItem
        orderId="order-live"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());

    // Unmount va remount ngay lap tuc khi request van dang bay trong bo nho
    unmount();

    renderWithClient(
      <OrderReviewItem
        orderId="order-live"
        itemContext={itemContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
    );

    // Request dang bay -> khong duoc phep replay hoac gui lai
    expect(screen.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled();

    // Request settle
    resolvePromise({
      id: 'rev-live',
      orderItemId: 'item-live',
      productId: 'p-live',
      rating: 5,
      content: null,
      moderationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    });

    await waitFor(() => {
      expect(getInDoubtSubmission('user-1', 'item-live')).toBeUndefined();
    });
  });

  it('timeout -> replay 409 -> GET loi -> retry GET thanh cong va doi chieu', async () => {
    mockAuthenticatedRequest.mockRejectedValueOnce(new Error('Initial timeout'));

    const itemContextWithoutReview: OrderReviewItemContext = {
      orderItemId: 'item-seq',
      productVariantId: 'v-seq',
      productId: 'p-seq',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-seq"
        itemContext={itemContextWithoutReview}
        onRetryContext={onRetryContext}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await screen.findByRole('button', { name: 'Gửi lại' });

    // Replay gap 409 Conflict
    mockAuthenticatedRequest.mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Review already exists',
        path: '/reviews',
        timestamp: '',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Review already exists'),
    );
    expect(getInDoubtSubmission('user-1', 'item-seq')?.status).toBe('conflict');

    // Sau 409, goi refetch GET context gap loi mang
    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-seq"
          contextError={new Error('Lỗi mạng khi tải context')}
          onRetryContext={onRetryContext}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Lỗi mạng khi tải context')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Thử lại' });
    expect(retryBtn).toBeInTheDocument();

    // Bam thu lai context
    fireEvent.click(retryBtn);
    expect(onRetryContext).toHaveBeenCalled();

    // Context GET thanh cong tra ve review
    const itemContextWithReview: OrderReviewItemContext = {
      ...itemContextWithoutReview,
      eligible: false,
      reasonCode: 'ALREADY_REVIEWED',
      review: {
        id: 'rev-reconciled',
        rating: 5,
        content: null,
        moderationStatus: 'PENDING',
        createdAt: '2026-11-12T00:00:00Z',
        updatedAt: '2026-11-12T00:00:00Z',
      },
    };

    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-seq"
          itemContext={itemContextWithReview}
          onRetryContext={onRetryContext}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument();
    });
    expect(getInDoubtSubmission('user-1', 'item-seq')).toBeUndefined();
  });

  // --- Regression P2 (Round 3): Request Identity & Switching Items / Epochs ---
  it('A pending -> render B -> A timeout: khong tao marker cho B, A ket thuc dung voi marker unknown_error', async () => {
    let rejectA!: (err: Error) => void;
    mockAuthenticatedRequest.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectA = reject;
        }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const baseContext = {
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={{ ...baseContext, orderItemId: 'item-A' }}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Payload for item A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());

    // Component tai su dung instance de hien thi item B khi A van dang pending
    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-1"
          itemContext={{ ...baseContext, orderItemId: 'item-B' }}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    // Request A that bai do timeout
    rejectA(new Error('Timeout A'));

    await waitFor(() => {
      // B tuyet doi khong co marker bi gan nham
      expect(getInDoubtSubmission('user-1', 'item-B')).toBeUndefined();
      // A co marker unknown_error dung voi payload goc cua A
      const markerA = getInDoubtSubmission('user-1', 'item-A');
      expect(markerA?.status).toBe('unknown_error');
      expect(markerA?.content).toBe('Payload for item A');
      expect(markerA?.rating).toBe(5);
    });

    // Man hinh item B khong bi set error cua item A
    expect(screen.queryByText('Timeout A')).toBeNull();
  });

  it('A pending -> render B -> A success: giai toa marker A, khong anh huong den B', async () => {
    let resolveA!: (val: unknown) => void;
    mockAuthenticatedRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const baseContext = {
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={{ ...baseContext, orderItemId: 'item-A' }}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());

    // Rerender sang item B
    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-1"
          itemContext={{ ...baseContext, orderItemId: 'item-B' }}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    // A thanh cong
    resolveA({
      id: 'rev-A',
      orderItemId: 'item-A',
      productId: 'prod-1',
      rating: 5,
      content: null,
      moderationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    });

    await waitFor(() => {
      expect(getInDoubtSubmission('user-1', 'item-A')).toBeUndefined();
      expect(getInDoubtSubmission('user-1', 'item-B')).toBeUndefined();
    });
  });

  it('A pending -> render B -> A 409 conflict: set marker conflict cho A, khong anh huong den B', async () => {
    let rejectA!: (err: Error) => void;
    mockAuthenticatedRequest.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectA = reject;
        }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const baseContext = {
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={{ ...baseContext, orderItemId: 'item-A' }}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('4 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalled());

    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-1"
          itemContext={{ ...baseContext, orderItemId: 'item-B' }}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    rejectA(
      new ApiError({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflict A',
        path: '/reviews',
        timestamp: '',
      }),
    );

    await waitFor(() => {
      expect(getInDoubtSubmission('user-1', 'item-B')).toBeUndefined();
      expect(getInDoubtSubmission('user-1', 'item-A')?.status).toBe('conflict');
    });
    expect(screen.queryByText('Conflict A')).toBeNull();
  });

  it('B co request rieng: settled cua A khong unregister hoac abort request cua B', async () => {
    let rejectA!: (err: Error) => void;
    let resolveB!: (val: unknown) => void;

    mockAuthenticatedRequest
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectA = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveB = resolve;
          }),
      );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const baseContext = {
      productVariantId: 'var-1',
      productId: 'prod-1',
      eligible: true,
      reasonCode: null,
      review: null,
    };

    const { rerender } = renderWithClient(
      <OrderReviewItem
        orderId="order-1"
        itemContext={{ ...baseContext, orderItemId: 'item-A' }}
        onReviewSubmitted={onReviewSubmitted}
      />,
      client,
    );

    // 1. Gui A
    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('5 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(1));

    // 2. Chuyen sang B va gui B
    rerender(
      <QueryClientProvider client={client}>
        <OrderReviewItem
          orderId="order-1"
          itemContext={{ ...baseContext, orderItemId: 'item-B' }}
          onReviewSubmitted={onReviewSubmitted}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
    fireEvent.click(screen.getByLabelText('4 sao'));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

    await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(2));

    // 3. A that bai do timeout
    rejectA(new Error('Timeout A'));

    await waitFor(() => {
      expect(getInDoubtSubmission('user-1', 'item-A')?.status).toBe('unknown_error');
    });

    // 4. Request B van dang bay trong bo nho (khong bi unregister boi A)
    const inDoubtB = getInDoubtSubmission('user-1', 'item-B');
    expect(inDoubtB?.status).toBe('in_flight');

    // 5. B thanh cong
    resolveB({
      id: 'rev-B',
      orderItemId: 'item-B',
      productId: 'prod-1',
      rating: 4,
      content: null,
      moderationStatus: 'PENDING',
      createdAt: '2026-11-12T00:00:00Z',
      updatedAt: '2026-11-12T00:00:00Z',
    });

    await waitFor(() => {
      expect(getInDoubtSubmission('user-1', 'item-B')).toBeUndefined();
    });
  });

  describe('Regression Round 4 (Codex): epoch & request ownership fencing', () => {
    it('cung actor dang nhap lai -> replay 409 -> late SessionChangedError tu phien cu khong ghi de marker conflict cua phien moi', async () => {
      let rejectOld!: (err: Error) => void;
      mockAuthenticatedRequest.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject;
          }),
      );

      const client1 = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const ctx: OrderReviewItemContext = {
        orderItemId: 'item-reg4',
        productVariantId: 'var-1',
        productId: 'prod-1',
        eligible: true,
        reasonCode: null,
        review: null,
      };

      const first = renderWithClient(
        <OrderReviewItem
          orderId="order-1"
          itemContext={ctx}
          onReviewSubmitted={onReviewSubmitted}
        />,
        client1,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
      fireEvent.click(screen.getByLabelText('5 sao'));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'payload cu' } });
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

      await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(1));

      // 1. Phien 1 unmount, doi phien: epoch = 2
      first.unmount();
      currentAuth = {
        user: { id: 'user-1' },
        authenticatedRequest: mockAuthenticatedRequest,
        getSessionEpoch: () => 2,
      };
      abortAllActiveRequests();

      // 2. Phien 2 replay -> 409 CONFLICT
      mockAuthenticatedRequest.mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          code: 'CONFLICT',
          message: 'Conflict roi',
          path: '/reviews',
          timestamp: '',
        }),
      );

      const client2 = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      renderWithClient(
        <OrderReviewItem
          orderId="order-1"
          itemContext={ctx}
          onReviewSubmitted={onReviewSubmitted}
        />,
        client2,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));

      await waitFor(() => {
        const marker = getInDoubtSubmission('user-1', 'item-reg4');
        expect(marker?.status).toBe('conflict');
        expect(marker?.sessionEpoch).toBe(2);
      });

      // 3. Phien 1 tra loi muon SessionChangedError
      rejectOld(new Error('SessionChangedError'));

      await new Promise((r) => setTimeout(r, 30));

      // 4. Marker van giu nguyen cua phien 2 (conflict, epoch 2), khong bi phien 1 ghi de thanh unknown_error / epoch 1
      const markerAfter = getInDoubtSubmission('user-1', 'item-reg4');
      expect(markerAfter?.status).toBe('conflict');
      expect(markerAfter?.sessionEpoch).toBe(2);
    });

    it('cung actor dang nhap lai: late success tu phien cu khong xoa marker cua phien moi', async () => {
      let resolveOld!: (val: unknown) => void;
      mockAuthenticatedRequest.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      );

      const client1 = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const ctx: OrderReviewItemContext = {
        orderItemId: 'item-reg4-success',
        productVariantId: 'var-1',
        productId: 'prod-1',
        eligible: true,
        reasonCode: null,
        review: null,
      };

      const first = renderWithClient(
        <OrderReviewItem
          orderId="order-1"
          itemContext={ctx}
          onReviewSubmitted={onReviewSubmitted}
        />,
        client1,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
      fireEvent.click(screen.getByLabelText('5 sao'));
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

      await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(1));

      // 1. Phien 1 unmount, doi phien sang epoch 2
      first.unmount();
      currentAuth = {
        user: { id: 'user-1' },
        authenticatedRequest: mockAuthenticatedRequest,
        getSessionEpoch: () => 2,
      };
      abortAllActiveRequests();

      // Dat mot marker thuoc epoch 2 (vi du conflict hoac unknown_error o phien 2)
      setInDoubtSubmission({
        actorId: 'user-1',
        orderItemId: 'item-reg4-success',
        rating: 5,
        content: 'phien 2',
        sessionEpoch: 2,
        requestId: 'req-epoch2',
        status: 'conflict',
        submittedAt: Date.now(),
      });

      // 2. Request cua phien 1 bat ngo tra ve resolve thanh cong
      resolveOld({
        id: 'rev-late',
        orderItemId: 'item-reg4-success',
        productId: 'prod-1',
        rating: 5,
        content: null,
        moderationStatus: 'PENDING',
        createdAt: '2026-11-12T00:00:00Z',
        updatedAt: '2026-11-12T00:00:00Z',
      });

      await new Promise((r) => setTimeout(r, 30));

      // 3. Marker epoch 2 khong bi xoa boi late success cua epoch 1
      const marker = getInDoubtSubmission('user-1', 'item-reg4-success');
      expect(marker).toBeDefined();
      expect(marker?.sessionEpoch).toBe(2);
      expect(marker?.status).toBe('conflict');
    });

    it('cung actor: late 400/422 hoac timeout tu phien cu khong anh huong marker phien moi', async () => {
      let rejectOld!: (err: Error) => void;
      mockAuthenticatedRequest.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOld = reject;
          }),
      );

      const client1 = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const ctx: OrderReviewItemContext = {
        orderItemId: 'item-reg4-badreq',
        productVariantId: 'var-1',
        productId: 'prod-1',
        eligible: true,
        reasonCode: null,
        review: null,
      };

      const first = renderWithClient(
        <OrderReviewItem
          orderId="order-1"
          itemContext={ctx}
          onReviewSubmitted={onReviewSubmitted}
        />,
        client1,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Viết đánh giá' }));
      fireEvent.click(screen.getByLabelText('5 sao'));
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));

      await waitFor(() => expect(mockAuthenticatedRequest).toHaveBeenCalledTimes(1));

      // Chuyen phien sang epoch 2
      first.unmount();
      currentAuth = {
        user: { id: 'user-1' },
        authenticatedRequest: mockAuthenticatedRequest,
        getSessionEpoch: () => 2,
      };
      abortAllActiveRequests();

      // Phien 2 co marker rieng
      setInDoubtSubmission({
        actorId: 'user-1',
        orderItemId: 'item-reg4-badreq',
        rating: 5,
        content: 'phien 2',
        sessionEpoch: 2,
        requestId: 'req-epoch2-unique',
        status: 'conflict',
        submittedAt: Date.now(),
      });

      // Phien 1 tra ve loi 400 VALIDATION_FAILED
      rejectOld(
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'Noi dung vi pham',
          path: '/reviews',
          timestamp: '',
        }),
      );

      await new Promise((r) => setTimeout(r, 30));

      // Marker phien 2 khong bi clear hoac bien doi
      const marker = getInDoubtSubmission('user-1', 'item-reg4-badreq');
      expect(marker).toBeDefined();
      expect(marker?.sessionEpoch).toBe(2);
      expect(marker?.status).toBe('conflict');
    });
  });
});
