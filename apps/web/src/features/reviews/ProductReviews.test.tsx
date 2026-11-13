import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/features/account';

import { ProductReviews } from './ProductReviews.js';
import type { Review, ReviewPage, ReviewSummary } from './reviews.api.js';

/** jsdom chua co HTMLDialogElement.showModal: stub toi thieu cho hop bao cao. */
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
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const summary: ReviewSummary = {
  average: 4.5,
  count: 2,
  distribution: [
    { rating: 5, count: 1 },
    { rating: 4, count: 1 },
    { rating: 3, count: 0 },
    { rating: 2, count: 0 },
    { rating: 1, count: 0 },
  ],
  withMediaCount: 0,
  withContentCount: 2,
  fit: { tooSmall: 0, trueToSize: 2, tooLarge: 0, total: 2 },
};
function review(overrides: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    rating: 5,
    content: 'Vải mát, mặc rất vừa.',
    fitFeedback: 'TRUE_TO_SIZE',
    variantLabel: 'Đen / M',
    heightCm: 165,
    weightKg: 55,
    reviewerName: 'Minh Anh',
    media: [],
    helpfulCount: 3,
    viewerHasVoted: false,
    isOwn: false,
    reply: { content: 'Cảm ơn bạn đã ủng hộ shop!', repliedAt: '2026-11-02T03:00:00.000Z' },
    createdAt: '2026-11-01T03:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}
const page = (items: Review[]): ReviewPage => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 6,
  totalPages: 1,
});

interface Call {
  method: string;
  path: string;
  auth: string | null;
  body: unknown;
}
const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const apiError = (status: number, code: string) =>
  json({ statusCode: status, code, message: code, path: '/x', timestamp: '' }, status);
const user = { id: 'u1', email: 'khach@example.test', roles: ['CUSTOMER'] };

/** Gia lap may chu: ghi lai moi lan goi (duong dan bo /api, token, than) de kiem sau. */
function stubServer(handle: (call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const call: Call = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, '') + url.search,
        auth: headers.Authorization ?? null,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      return handle(call) ?? apiError(404, 'NOT_FOUND');
    }),
  );
  return calls;
}

function LoginProbe() {
  const location = useLocation();
  return <p data-testid="from">{(location.state as { from?: string } | null)?.from}</p>;
}
function show({ signedIn }: { signedIn: boolean }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const routes: ReactNode = (
    <MemoryRouter initialEntries={['/san-pham/ao-thun?color=den']}>
      <Routes>
        <Route path="/san-pham/:slug" element={<ProductReviews slug="ao-thun" />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
  render(
    <QueryClientProvider client={client}>
      {signedIn ? <AuthProvider>{routes}</AuthProvider> : routes}
    </QueryClientProvider>,
  );
}
const listCalls = (calls: Call[]) =>
  calls.filter((call) => call.path.startsWith('/products/ao-thun/reviews?'));

describe('UC-11.3 khu đánh giá trên trang sản phẩm', () => {
  it('UC-11.3/AC5 khách: chỉ tải khi mở, không gửi token; bình chọn dẫn về đăng nhập rồi quay lại', async () => {
    const calls = stubServer((call) => {
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) return json(page([review()]));
    });
    show({ signedIn: false });

    expect(screen.getByRole('heading', { name: 'Đánh giá sản phẩm' })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));

    expect(await screen.findByText('Minh Anh')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4,5 trên 5 sao' })).toBeInTheDocument();
    expect(screen.getByText('2 đánh giá')).toBeInTheDocument();
    expect(screen.getByText('Cảm ơn bạn đã ủng hộ shop!')).toBeInTheDocument();
    expect(calls.every((call) => call.auth === null)).toBe(true);

    fireEvent.click(screen.getByRole('link', { name: /đăng nhập để bình chọn/ }));
    expect(await screen.findByTestId('from')).toHaveTextContent('/san-pham/ao-thun?color=den');
  });

  it('UC-11.3/AC6 lưới ảnh chỉ tải bản thu nhỏ; bấm ảnh thì thư viện mở bản lớn', async () => {
    const photo = {
      url: 'https://cdn.test/freya/reviews/u2/a.jpg',
      thumbnailUrl: 'https://cdn.test/thumb/freya/reviews/u2/a.jpg',
    };
    stubServer((call) => {
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) {
        return json(page([review({ media: [photo] })]));
      }
    });
    show({ signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));

    const open = await screen.findByRole('button', { name: 'Xem ảnh 1' });
    expect(open.querySelector('img')).toHaveAttribute('src', photo.thumbnailUrl);
    expect(document.querySelector(`img[src="${photo.url}"]`)).toBeNull();

    fireEvent.click(open);
    const gallery = await screen.findByRole('dialog', { name: 'Thư viện ảnh sản phẩm' });
    expect(within(gallery).getByRole('img', { name: 'Ảnh khách gửi 1' })).toHaveAttribute(
      'src',
      photo.url,
    );
  });

  it('UC-11.3/AC7 biên: chưa có đánh giá thì chỉ báo trống, không vẽ bảng sao hay bộ lọc', async () => {
    const empty: ReviewSummary = {
      average: 0,
      count: 0,
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 })),
      withMediaCount: 0,
      withContentCount: 0,
      fit: { tooSmall: 0, trueToSize: 0, tooLarge: 0, total: 0 },
    };
    stubServer((call) => {
      if (call.path === '/products/ao-thun/reviews/summary') return json(empty);
      if (call.path.startsWith('/products/ao-thun/reviews?')) return json(page([]));
    });
    show({ signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));

    expect(await screen.findByText(/Chưa có đánh giá nào/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Phân bố số sao' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Lọc đánh giá' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /trên 5 sao/ })).not.toBeInTheDocument();
  });

  it('UC-11.3/AC7 biên: lọc một mức sao không có bài thì báo không có đánh giá khớp', async () => {
    stubServer((call) => {
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) {
        return json(page(call.path.includes('rating=3') ? [] : [review()]));
      }
    });
    show({ signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));
    await screen.findByText('Minh Anh');

    fireEvent.click(screen.getByRole('button', { name: '3 sao: 0 đánh giá' }));
    expect(await screen.findByText('Không có đánh giá khớp bộ lọc.')).toBeInTheDocument();
    expect(screen.queryByText('Minh Anh')).not.toBeInTheDocument();
  });

  it('UC-11.3/AC1 bấm một mức sao thì lọc theo mức đó; bấm lại thì bỏ lọc', async () => {
    const calls = stubServer((call) => {
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) return json(page([review()]));
    });
    show({ signedIn: false });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));
    await screen.findByText('Minh Anh');

    const five = screen.getByRole('button', { name: '5 sao: 1 đánh giá' });
    fireEvent.click(five);
    await waitFor(() => expect(listCalls(calls).at(-1)?.path).toContain('rating=5'));
    expect(five).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(five);
    await waitFor(() => expect(five).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('UC-11.3/AC2 đã đăng nhập, token hết hạn: làm mới một lần rồi tải lại; bỏ phiếu cập nhật ngay', async () => {
    let refreshes = 0;
    const calls = stubServer((call) => {
      if (call.path === '/auth/refresh') {
        refreshes += 1;
        return json({ accessToken: `tok${refreshes}`, user });
      }
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) {
        // Duong dan cong khai van kiem token neu co gui: token cu bi tu choi 401.
        return call.auth === 'Bearer tok1'
          ? apiError(401, 'UNAUTHORIZED')
          : json(page([review({ viewerHasVoted: true })]));
      }
      if (call.method === 'DELETE' && call.path === '/reviews/r1/helpful') {
        return json({ helpfulCount: 2, voted: false });
      }
    });
    show({ signedIn: true });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));

    const vote = await screen.findByRole('button', { name: 'Hữu ích (3)' });
    expect(vote).toHaveAttribute('aria-pressed', 'true');
    expect(refreshes).toBe(2);
    expect(listCalls(calls).map((call) => call.auth)).toEqual(['Bearer tok1', 'Bearer tok2']);

    fireEvent.click(vote);
    const updated = await screen.findByRole('button', { name: 'Hữu ích (2)' });
    expect(updated).toHaveAttribute('aria-pressed', 'false');
    expect(calls.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/reviews/r1/helpful',
      auth: 'Bearer tok2',
    });
  });

  it('UC-11.3/AC3 báo cáo gửi lý do và ghi chú; báo xong hiện lời cảm ơn, đánh giá vẫn còn', async () => {
    const calls = stubServer((call) => {
      if (call.path === '/auth/refresh') return json({ accessToken: 'tok1', user });
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) return json(page([review()]));
      if (call.method === 'POST' && call.path === '/reviews/r1/report') return json(undefined, 204);
    });
    show({ signedIn: true });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Báo cáo' }));

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Lộ thông tin cá nhân' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Ghi chú thêm/ }), {
      target: { value: '  Có số điện thoại  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gửi báo cáo' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đã gửi báo cáo');
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/reviews/r1/report',
      body: { reason: 'PRIVACY', note: 'Có số điện thoại' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Minh Anh')).toBeInTheDocument();
  });

  it('UC-11.3/AC2 đánh giá của chính mình không có nút bình chọn hay báo cáo', async () => {
    stubServer((call) => {
      if (call.path === '/auth/refresh') return json({ accessToken: 'tok1', user });
      if (call.path === '/products/ao-thun/reviews/summary') return json(summary);
      if (call.path.startsWith('/products/ao-thun/reviews?')) {
        return json(page([review({ isOwn: true })]));
      }
    });
    show({ signedIn: true });
    fireEvent.click(screen.getByRole('button', { name: 'Xem đánh giá' }));

    expect(await screen.findByText('Đánh giá của bạn · 3 hữu ích')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hữu ích/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Báo cáo' })).not.toBeInTheDocument();
  });
});
