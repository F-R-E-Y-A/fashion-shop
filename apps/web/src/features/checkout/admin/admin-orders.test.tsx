import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import type { AdminOrder } from './admin-orders.api.js';
import { AdminOrderDetailPage } from './AdminOrderDetailPage.js';
import { AdminOrdersPage } from './AdminOrdersPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({ user: { id: 'admin1' }, authenticatedRequest: request }),
}));

/** jsdom chua co HTMLDialogElement.showModal: stub toi thieu, khong chung minh top layer. */
beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal(): void };
  if (typeof proto.showModal === 'function') return;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
beforeEach(() => {
  request.mockReset();
});

function show(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const apiError = (statusCode: number, message: string) =>
  new ApiError({ statusCode, code: 'TEST', message, path: '/x', timestamp: '' });

const base: AdminOrder = {
  id: 'o1',
  orderCode: 'FR261031ABCD1234',
  checkoutFingerprint: null,
  status: 'DELIVERED',
  paymentDueAt: null,
  createdAt: '2026-10-31T03:00:00.000Z',
  address: {
    id: 'a1',
    recipientName: 'Khách',
    phone: '0901234567',
    detailAddress: '1 Đường A',
    commune: 'Phường B',
    province: 'TP.HCM',
  },
  subtotalAmount: '200000.00',
  discountAmount: '0.00',
  shippingFeeAmount: '30000.00',
  totalAmount: '230000.00',
  items: [
    {
      variantId: 'v1',
      quantity: 1,
      price: '200000.00',
      snapshot: { name: 'Áo thử', variantLabel: 'Đen / M', imageUrl: null, productSlug: 'ao' },
    },
  ],
  payments: [
    { id: 'p1', gateway: 'VNPAY', reference: 'R1', status: 'SUCCEEDED', checkoutUrl: null },
  ],
  userId: 'u1',
  customerEmail: 'khach@example.test',
  history: [{ status: 'DELIVERED', at: '2026-10-31T03:01:00.000Z', actorUserId: null }],
  ledgers: [
    {
      paymentId: 'p1',
      gateway: 'VNPAY',
      status: 'SUCCEEDED',
      amount: '230000.00',
      refundedAmount: '0.00',
      refundableAmount: '230000.00',
      refunds: [],
      pendingRefund: null,
    },
  ],
  actions: {
    confirmCod: false,
    startProcessing: false,
    cancelRefund: false,
    markDelivered: false,
    deliveryFailed: false,
  },
};

describe('PH-11 quản trị đơn hàng (ADR-038)', () => {
  it('mặc định tab Cần xử lý; đổi tab gửi bộ lọc trạng thái và hiện từng dòng', async () => {
    request.mockResolvedValue({
      items: [
        {
          id: 'o1',
          orderCode: 'FR261031ABCD1234',
          status: 'PENDING_CONFIRMATION',
          createdAt: '2026-10-31T03:00:00.000Z',
          customerEmail: 'khach@example.test',
          totalAmount: '230000.00',
          itemCount: 2,
          gateway: 'COD',
          paymentStatus: 'PENDING',
          refundedAmount: '0.00',
          refundPending: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    show('/admin/orders');
    expect(await screen.findByRole('link', { name: 'FR261031ABCD1234' })).toHaveAttribute(
      'href',
      '/admin/orders/o1',
    );
    expect(request.mock.calls[0]![0]).toContain('attention=true');
    fireEvent.click(screen.getByRole('button', { name: 'Chờ xác nhận COD' }));
    await waitFor(() =>
      expect(request.mock.calls.at(-1)![0]).toContain('status=PENDING_CONFIRMATION'),
    );
    expect(screen.getByRole('button', { name: 'Chờ xác nhận COD' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hoàn tiền một phần: hộp xác nhận điền sẵn số còn hoàn được, gửi số đã sửa và lý do', async () => {
    request.mockImplementation(async (path: string) => (path.endsWith('/refund') ? {} : base));
    show('/admin/orders/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền VNPAY' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByRole('textbox', { name: /Số tiền hoàn/ });
    expect(amount).toHaveValue('230000.00');
    fireEvent.change(amount, { target: { value: '100000' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do/ }), {
      target: { value: 'Thiếu phụ kiện' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tiền' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/admin/payments/p1/refund', {
        method: 'POST',
        body: { amount: '100000', reason: 'Thiếu phụ kiện' },
      }),
    );
    expect(await screen.findByText('Cổng đã xác nhận hoàn tiền.')).toBeInTheDocument();
  });

  it('COD đang giao: giao thất bại bắt buộc lý do; chốt lệnh hoàn chỉ hiện khi chốt được', async () => {
    request.mockResolvedValue({
      ...base,
      status: 'PROCESSING',
      payments: [
        { id: 'c1', gateway: 'COD', reference: 'C1', status: 'PENDING', checkoutUrl: null },
      ],
      ledgers: [
        {
          ...base.ledgers[0]!,
          paymentId: 'c1',
          gateway: 'COD',
          status: 'PENDING',
          refundableAmount: null,
        },
      ],
      actions: {
        confirmCod: false,
        startProcessing: false,
        cancelRefund: false,
        markDelivered: true,
        deliveryFailed: true,
      },
    });
    show('/admin/orders/o1');
    expect(await screen.findByRole('button', { name: 'Đã giao, đã thu tiền' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hoàn tiền/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chốt lệnh hoàn' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Giao thất bại' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi giao thất bại' }));
    expect(within(dialog).getByText('Nhập nội dung trước khi xác nhận.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('/admin/orders/o1/delivery-failed', expect.anything());
  });

  it('hoàn tiền gặp 5xx: báo chưa xác định kết quả, không in lỗi thô, đọc lại đơn (ADR-039)', async () => {
    let refunds = 0;
    request.mockImplementation(async (path: string) => {
      if (!path.endsWith('/refund')) return base;
      refunds += 1;
      throw apiError(502, 'Bad Gateway');
    });
    show('/admin/orders/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền VNPAY' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tiền' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /Chưa xác định được kết quả: thao tác có thể đã được thực hiện/,
    );
    expect(screen.queryByText(/Bad Gateway/)).not.toBeInTheDocument();
    expect(refunds).toBe(1);
    await waitFor(() =>
      expect(request.mock.calls.filter(([path]) => path === '/admin/orders/o1')).toHaveLength(2),
    );
  });

  it('409 từ máy chủ: giữ câu nghiệp vụ của máy chủ và báo đã tải lại', async () => {
    request.mockImplementation(async (path: string) => {
      if (!path.endsWith('/refund')) return base;
      throw apiError(409, 'Đang có lệnh hoàn chờ kết quả.');
    });
    show('/admin/orders/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền VNPAY' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tiền' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Đang có lệnh hoàn chờ kết quả. Thông tin đơn đã được tải lại.',
    );
  });
});
