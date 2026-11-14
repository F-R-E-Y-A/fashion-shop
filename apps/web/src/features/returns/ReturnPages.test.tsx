import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyReturnsPage } from './MyReturnsPage.js';
import { ReturnDetailPage } from './ReturnDetailPage.js';
import { apiError, page, returnRequest, stubBrowser } from './returns.fixtures.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({ user: { id: 'u1' }, authenticatedRequest: request }),
}));

beforeAll(stubBrowser);
beforeEach(() => {
  request.mockReset();
});

function show(path: string, element: ReactNode, route: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const showDetail = () =>
  show('/tai-khoan/tra-hang/r1', <ReturnDetailPage />, '/tai-khoan/tra-hang/:id');
const cancels = () =>
  request.mock.calls.filter(
    ([path, options]) => path === '/returns/r1/cancel' && options?.method === 'POST',
  );

describe('UC-14.1 khách theo dõi yêu cầu trả hàng', () => {
  it('UC-14.1/AC1 danh sách: trạng thái, mã đơn, ngày gửi, số tiền hoàn, liên kết tới chi tiết', async () => {
    request.mockResolvedValue(
      page([
        returnRequest(),
        returnRequest({
          id: 'r2',
          orderCode: 'FR-O2',
          status: 'COMPLETED',
          refundAmount: '350000.00',
        }),
      ]),
    );
    show('/tai-khoan/tra-hang', <MyReturnsPage />, '/tai-khoan/tra-hang');
    const first = (await screen.findByRole('link', { name: 'Đơn FR-O1' })).closest('li')!;
    expect(first).toHaveTextContent('Chờ shop duyệt');
    expect(first).toHaveTextContent('Hoàn dự kiến: 200.000');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/tai-khoan/tra-hang/r1');
    const second = screen.getByRole('link', { name: 'Đơn FR-O2' }).closest('li')!;
    expect(second).toHaveTextContent('Đã hoàn tiền');
    expect(request).toHaveBeenCalledWith('/returns?page=1&pageSize=10', expect.anything());
  });

  it('UC-14.1/AC1 danh sách rỗng có thông báo riêng', async () => {
    request.mockResolvedValueOnce(page([]));
    show('/tai-khoan/tra-hang', <MyReturnsPage />, '/tai-khoan/tra-hang');
    expect(await screen.findByText('Bạn chưa có yêu cầu trả hàng nào.')).toBeInTheDocument();
  });

  it('UC-14.1/AC1 lỗi tải danh sách: báo lỗi và có nút thử lại', async () => {
    request.mockRejectedValue(apiError(500, 'INTERNAL'));
    show('/tai-khoan/tra-hang', <MyReturnsPage />, '/tai-khoan/tra-hang');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được yêu cầu trả hàng.');
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeInTheDocument();
  });

  it('UC-14.1/AC1 chi tiết: tiến trình dừng ở bước hiện tại, có liên kết về đơn', async () => {
    request.mockResolvedValue(
      returnRequest({
        status: 'APPROVED',
        canCancel: false,
        decidedAt: '2026-11-13T03:00:00.000Z',
        decisionNote: 'Gửi hàng về kho Quận 1.',
      }),
    );
    showDetail();
    const timeline = await screen.findByRole('list', { name: 'Tiến trình trả hàng' });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Đã gửi'),
      expect.stringContaining('Shop đã duyệt'),
      expect.stringContaining('Shop đã nhận hàng'),
      expect.stringContaining('Đã hoàn tiền'),
    ]);
    expect(steps[0]).toHaveAttribute('data-state', 'done');
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[2]).toHaveAttribute('data-state', 'todo');
    expect(screen.getByText(/Gửi hàng về kho Quận 1\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem đơn hàng' })).toHaveAttribute(
      'href',
      '/don-hang/o1',
    );
    expect(screen.queryByRole('button', { name: 'Huỷ yêu cầu' })).not.toBeInTheDocument();
  });

  it('UC-14.1/AC1 bị từ chối: hiện lý do shop ghi, tiến trình dừng ở "Bị từ chối"', async () => {
    request.mockResolvedValueOnce(
      returnRequest({
        status: 'REJECTED',
        canCancel: false,
        decisionNote: 'Áo đã giặt, không nhận trả.',
      }),
    );
    showDetail();
    expect(
      await screen.findByText(/Lý do từ chối: Áo đã giặt, không nhận trả\./),
    ).toBeInTheDocument();
    const steps = within(screen.getByRole('list', { name: 'Tiến trình trả hàng' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent('Bị từ chối');
    expect(steps[1]).toHaveAttribute('data-state', 'bad');
  });

  it('UC-14.1/AC1 đã hoàn tiền: cả bốn bước đã xong, không còn nút huỷ', async () => {
    request.mockResolvedValueOnce(
      returnRequest({
        status: 'COMPLETED',
        canCancel: false,
        decidedAt: '2026-11-13T03:00:00.000Z',
        receivedAt: '2026-11-15T03:00:00.000Z',
        completedAt: '2026-11-16T03:00:00.000Z',
      }),
    );
    showDetail();
    const steps = within(
      await screen.findByRole('list', { name: 'Tiến trình trả hàng' }),
    ).getAllByRole('listitem');
    expect(steps.map((step) => step.getAttribute('data-state'))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(screen.queryByRole('button', { name: 'Huỷ yêu cầu' })).not.toBeInTheDocument();
  });

  it('UC-14.1/AC8 huỷ khi còn chờ duyệt: xác nhận rồi gọi API huỷ và báo đã huỷ', async () => {
    // May chu co trang thai: sau khi huy, lan tai lai cung tra yeu cau da huy.
    let cancelled = false;
    request.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') cancelled = true;
      return cancelled ? returnRequest({ status: 'CANCELLED', canCancel: false }) : returnRequest();
    });
    showDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ yêu cầu' }));
    const dialog = await screen.findByRole('dialog');
    expect(cancels()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ yêu cầu' }));
    expect(await screen.findByText('Đã huỷ yêu cầu trả hàng.')).toBeInTheDocument();
    expect(cancels()).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Huỷ yêu cầu' })).not.toBeInTheDocument(),
    );
  });

  it('UC-14.1/AC8 shop vừa duyệt: huỷ bị 409, báo rõ và giữ hộp để khách đọc', async () => {
    request.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw apiError(409, 'RETURN_STATE_CHANGED');
      return returnRequest();
    });
    showDetail();
    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ yêu cầu' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ yêu cầu' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Shop vừa xử lý yêu cầu này nên không huỷ được nữa.',
    );
  });

  it('UC-14.1/E7 yêu cầu của người khác (404): báo không tìm thấy', async () => {
    request.mockRejectedValue(apiError(404, 'RETURN_NOT_FOUND'));
    showDetail();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tìm thấy yêu cầu trả hàng này.',
    );
  });
});
