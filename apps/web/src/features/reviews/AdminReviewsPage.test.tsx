import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import { AdminReviewsPage } from './AdminReviewsPage.js';
import type { AdminReview } from './reviews.api.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({
    user: { id: 'admin1' },
    authenticatedRequest: request,
    getSessionEpoch: () => 1,
  }),
}));

/** jsdom chua co HTMLDialogElement.showModal: stub toi thieu cho hop xac nhan. */
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
// Than ham co ngoac: tra ve mock thi Vitest coi la ham don dep va goi request() khong doi so.
beforeEach(() => {
  request.mockReset();
});

function adminReview(overrides: Partial<AdminReview> = {}): AdminReview {
  return {
    id: 'r1',
    reviewer: { id: 'u1', email: 'khach@example.test', displayName: 'Minh Anh' },
    product: { name: 'Áo thun cổ tròn', slug: 'ao-thun', imageUrl: null },
    orderCode: 'FR-O1',
    variantLabel: 'Đen / M',
    rating: 2,
    content: 'Inbox 0901234567 để mua rẻ hơn',
    fitFeedback: null,
    heightCm: null,
    weightKg: null,
    isAnonymous: false,
    media: [],
    status: 'PENDING',
    moderationNote: null,
    moderatedAt: null,
    helpfulCount: 0,
    reportCount: 0,
    editCount: 0,
    reports: [],
    reply: null,
    createdAt: '2026-11-10T03:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}
const page = (items: AdminReview[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
  totalPages: 1,
});
const apiError = (statusCode: number, code: string) =>
  new ApiError({ statusCode, code, message: code, path: '/admin/reviews', timestamp: '' });
const calls = (method: string, path: string) =>
  request.mock.calls.filter(
    ([callPath, options]) => callPath === path && (options?.method ?? 'GET') === method,
  );

function show(path = '/admin/reviews') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/reviews" element={<AdminReviewsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UC-11.2 quản trị duyệt và phản hồi đánh giá', () => {
  it('UC-11.2/AC2 mặc định hàng chờ duyệt; duyệt xong báo và tải lại danh sách', async () => {
    let approved = false;
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/reviews/r1/approve' && options?.method === 'POST') {
        approved = true;
        return adminReview({ status: 'APPROVED' });
      }
      if (path.startsWith('/admin/reviews?')) return page(approved ? [] : [adminReview()]);
      throw new Error(`Không mong đợi ${path}`);
    });
    show();

    expect(await screen.findByText('Áo thun cổ tròn')).toBeInTheDocument();
    expect(request.mock.calls[0]![0]).toBe('/admin/reviews?page=1&pageSize=20&status=PENDING');
    expect(screen.getByRole('tab', { name: 'Chờ duyệt' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/khach@example\.test · Đơn FR-O1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByText('Đã duyệt, đánh giá đang hiển thị.')).toBeInTheDocument();
    expect(await screen.findByText('Không có đánh giá nào khớp bộ lọc.')).toBeInTheDocument();
    expect(calls('POST', '/admin/reviews/r1/approve').map(([, options]) => options.body)).toEqual([
      { editCount: 0 },
    ]);
  });

  it('UC-11.2/AC7 khách vừa sửa: 409 thì đóng hộp, cảnh báo, tải lại; duyệt lại gửi phiên bản mới', async () => {
    let edited = false;
    request.mockImplementation(
      async (path: string, options?: { method?: string; body?: { editCount: number } }) => {
        if (path === '/admin/reviews/r1/approve') {
          if (options?.body?.editCount !== 1) {
            edited = true;
            throw apiError(409, 'REVIEW_CHANGED');
          }
          return adminReview({ status: 'APPROVED', editCount: 1 });
        }
        if (path.startsWith('/admin/reviews?')) {
          return page([
            edited
              ? adminReview({
                  editCount: 1,
                  content: 'Bản đã sửa',
                  editedAt: '2026-11-11T03:00:00.000Z',
                })
              : adminReview(),
          ]);
        }
        throw new Error(`Không mong đợi ${path}`);
      },
    );
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Khách vừa sửa đánh giá này.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Bản đã sửa')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã duyệt, đánh giá đang hiển thị.')).toBeInTheDocument();
    expect(calls('POST', '/admin/reviews/r1/approve').map(([, options]) => options.body)).toEqual([
      { editCount: 0 },
      { editCount: 1 },
    ]);
  });

  it('UC-11.2/AC3 ẩn phải có lý do; lý do gửi kèm, đã bị ẩn trước đó thì báo rõ', async () => {
    let rejects = 0;
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/reviews/r1/reject' && options?.method === 'POST') {
        rejects += 1;
        if (rejects === 1) throw apiError(409, 'REVIEW_ALREADY_REJECTED');
        return adminReview({ status: 'REJECTED' });
      }
      if (path.startsWith('/admin/reviews?')) return page([adminReview()]);
      throw new Error(`Không mong đợi ${path}`);
    });
    show();

    fireEvent.click(await screen.findByRole('button', { name: 'Ẩn' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Ẩn đánh giá' });
    fireEvent.click(confirm);
    expect(within(dialog).getByText('Cần nhập nội dung trước khi xác nhận.')).toBeInTheDocument();
    expect(calls('POST', '/admin/reviews/r1/reject')).toHaveLength(0);

    fireEvent.change(within(dialog).getByRole('textbox', { name: /Lý do ẩn/ }), {
      target: { value: '  Chứa số điện thoại để bán ngoài.  ' },
    });
    fireEvent.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Đánh giá này đã bị ẩn trước đó.',
    );

    fireEvent.click(confirm);
    expect(await screen.findByText('Đã ẩn đánh giá.')).toBeInTheDocument();
    expect(calls('POST', '/admin/reviews/r1/reject').map(([, options]) => options.body)).toEqual([
      { note: 'Chứa số điện thoại để bán ngoài.', editCount: 0 },
      { note: 'Chứa số điện thoại để bán ngoài.', editCount: 0 },
    ]);
  });

  it('UC-11.2/AC4 phản hồi điền sẵn nội dung cũ khi sửa; gỡ phản hồi gọi DELETE', async () => {
    const replied = adminReview({
      status: 'APPROVED',
      reply: { content: 'Shop cảm ơn bạn.', repliedAt: '2026-11-11T03:00:00.000Z' },
    });
    request.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/admin/reviews/r1/reply') return replied;
      if (path.startsWith('/admin/reviews?')) return page([replied]);
      throw new Error(`Không mong đợi ${path} ${options?.method}`);
    });
    show('/admin/reviews?status=APPROVED');

    fireEvent.click(await screen.findByRole('button', { name: 'Sửa phản hồi' }));
    const dialog = screen.getByRole('dialog');
    const text = within(dialog).getByRole('textbox', { name: 'Nội dung phản hồi' });
    expect(text).toHaveValue('Shop cảm ơn bạn.');
    fireEvent.change(text, { target: { value: 'Shop cảm ơn, hẹn gặp lại bạn!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã lưu phản hồi của shop.')).toBeInTheDocument();
    expect(calls('PUT', '/admin/reviews/r1/reply')[0]![1].body).toEqual({
      content: 'Shop cảm ơn, hẹn gặp lại bạn!',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ phản hồi' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(calls('DELETE', '/admin/reviews/r1/reply')).toHaveLength(1));
    expect(await screen.findByText('Đã gỡ phản hồi.')).toBeInTheDocument();
  });

  it('UC-11.2/AC5 lọc hàng bị báo cáo (mọi trạng thái), xem lý do, bỏ báo cáo sai', async () => {
    const reported = adminReview({
      status: 'APPROVED',
      reportCount: 2,
      reports: [
        { reason: 'OFFENSIVE', note: 'Chửi shop', createdAt: '2026-11-11T03:00:00.000Z' },
        { reason: 'SPAM', note: null, createdAt: '2026-11-10T03:00:00.000Z' },
      ],
    });
    request.mockImplementation(async (path: string) => {
      if (path === '/admin/reviews/r1/clear-reports') return { ...reported, reportCount: 0 };
      if (path.startsWith('/admin/reviews?')) return page([reported]);
      throw new Error(`Không mong đợi ${path}`);
    });
    show();
    await screen.findByText('Áo thun cổ tròn');

    // Chi danh gia dang hien moi bi bao cao duoc: bat loc nay o tab Cho duyet thi chuyen sang Tat ca.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chỉ đánh giá bị báo cáo' }));
    await waitFor(() =>
      expect(request.mock.calls.at(-1)![0]).toBe('/admin/reviews?page=1&pageSize=20&reported=true'),
    );
    expect(screen.getByRole('tab', { name: 'Tất cả' })).toHaveAttribute('aria-selected', 'true');
    const reasons = screen.getByRole('list', { name: 'Báo cáo gần nhất' });
    expect(
      within(reasons)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Ngôn từ thô tục, xúc phạm: Chửi shop', 'Quảng cáo, spam']);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ báo cáo' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã xoá báo cáo.')).toBeInTheDocument();
    expect(calls('POST', '/admin/reviews/r1/clear-reports')).toHaveLength(1);
  });

  it('UC-11.2/AC1 không đủ quyền (403): thay trang bằng thông báo, không lộ dữ liệu', async () => {
    request.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    show();
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Áo thun cổ tròn')).not.toBeInTheDocument();
  });
});
