import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminReturnDetailPage } from './AdminReturnDetailPage.js';
import { AdminReturnsPage } from './AdminReturnsPage.js';
import type { AdminReturn } from './returns.api.js';
import { adminReturn, apiError, page, stubBrowser } from './returns.fixtures.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({
    user: { id: 'admin1' },
    authenticatedRequest: request,
    getSessionEpoch: () => 1,
  }),
}));

beforeAll(stubBrowser);
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
          <Route path="/admin/returns" element={<AdminReturnsPage />} />
          <Route path="/admin/returns/:id" element={<AdminReturnDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const calls = (method: string, path: string) =>
  request.mock.calls.filter(
    ([callPath, options]) => callPath === path && (options?.method ?? 'GET') === method,
  );
/** Chi tiet tra ve `row`; POST doi sang trang thai `after` de mo phong may chu co trang thai. */
function serve(row: AdminReturn, after?: Partial<AdminReturn>) {
  let current = row;
  request.mockImplementation(async (_path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') {
      current = { ...current, ...after };
      return current;
    }
    return current;
  });
}
const buttons = () => screen.queryAllByRole('button').map((button) => button.textContent);
const dialogConfirm = async (name: string) => {
  const dialog = await screen.findByRole('dialog');
  return { dialog, confirm: () => fireEvent.click(within(dialog).getByRole('button', { name })) };
};

describe('UC-14.2 quản trị viên duyệt và xử lý trả hàng', () => {
  it('UC-14.2/AC1 danh sách mặc định lọc chờ duyệt, hiện ngày, mã đơn, email, lý do, số món, tiền, trạng thái', async () => {
    request.mockResolvedValue(page([adminReturn()]));
    show('/admin/returns');
    const row = (await screen.findByRole('link', { name: 'FR-O1' })).closest('tr')!;
    expect(row).toHaveTextContent('khach@example.test');
    expect(row).toHaveTextContent('Cỡ không vừa');
    expect(row).toHaveTextContent('200.000');
    expect(row).toHaveTextContent('Chờ shop duyệt');
    expect(request).toHaveBeenCalledWith(
      '/admin/returns?page=1&pageSize=20&status=REQUESTED',
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: 'Chờ duyệt' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('UC-14.2/AC1 bấm tab "Tất cả" thì bỏ tham số status; danh sách rỗng có thông báo', async () => {
    request.mockResolvedValue(page([]));
    show('/admin/returns');
    expect(await screen.findByText('Không có yêu cầu nào chờ duyệt.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/admin/returns?page=1&pageSize=20', expect.anything()),
    );
  });

  it('UC-14.2/AC8 không đủ quyền (403): thay trang bằng thông báo, không lộ dữ liệu', async () => {
    request.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    show('/admin/returns');
    expect(await screen.findByText('Không đủ quyền truy cập')).toBeInTheDocument();
  });

  it('UC-14.2/AC1 lỗi tải danh sách: báo lỗi, có nút thử lại', async () => {
    request.mockRejectedValue(apiError(500, 'INTERNAL'));
    show('/admin/returns');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được yêu cầu trả hàng');
  });

  it.each([
    ['REQUESTED', ['Duyệt', 'Từ chối']],
    ['APPROVED', ['Đã nhận hàng']],
    ['RECEIVED', ['Hoàn tiền']],
    ['COMPLETED', []],
    ['REJECTED', []],
    ['CANCELLED', []],
  ] as const)('UC-14.2/AC7 trạng thái %s chỉ có thao tác hợp lệ', async (status, expected) => {
    request.mockResolvedValue(adminReturn({ status }));
    show('/admin/returns/r1');
    await screen.findByRole('heading', { level: 1, name: /Trả hàng đơn FR-O1/ });
    expect(buttons().filter((text) => text !== 'Sao chép')).toEqual(expected);
  });

  it('UC-14.2/AC2 từ chối bắt buộc lý do; có lý do thì gửi note và hiện thông báo', async () => {
    serve(adminReturn(), { status: 'REJECTED', decisionNote: 'Áo đã giặt.' });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const { dialog, confirm } = await dialogConfirm('Từ chối');
    confirm();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Nhập lý do từ chối');
    expect(calls('POST', '/admin/returns/r1/reject')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText(/Lý do từ chối/), {
      target: { value: '  Áo đã giặt.  ' },
    });
    confirm();
    expect(await screen.findByText('Đã từ chối yêu cầu trả hàng.')).toBeInTheDocument();
    expect(calls('POST', '/admin/returns/r1/reject')[0]![1].body).toEqual({ note: 'Áo đã giặt.' });
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
  });

  it('UC-14.2/AC1 duyệt: ghi chú không bắt buộc, gửi thân rỗng khi bỏ trống', async () => {
    serve(adminReturn(), { status: 'APPROVED' });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const { confirm } = await dialogConfirm('Duyệt');
    confirm();
    expect(await screen.findByText('Đã duyệt yêu cầu trả hàng.')).toBeInTheDocument();
    expect(calls('POST', '/admin/returns/r1/approve')[0]![1].body).toEqual({});
    // Sang APPROVED: thao tac tiep theo la "Da nhan hang".
    expect(await screen.findByRole('button', { name: 'Đã nhận hàng' })).toBeInTheDocument();
  });

  it('UC-14.2/AC3 đã nhận hàng: xác nhận rồi gọi receive, nút chuyển thành Hoàn tiền', async () => {
    serve(adminReturn({ status: 'APPROVED' }), { status: 'RECEIVED' });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Đã nhận hàng' }));
    const { confirm } = await dialogConfirm('Đã nhận hàng');
    expect(calls('POST', '/admin/returns/r1/receive')).toHaveLength(0);
    confirm();
    expect(await screen.findByRole('button', { name: 'Hoàn tiền' })).toBeInTheDocument();
    expect(calls('POST', '/admin/returns/r1/receive')[0]![1].body).toEqual({});
  });

  it('UC-14.2/AC5 hoàn qua cổng: hộp xác nhận ghi số tiền, không hỏi mã giao dịch, gửi thân rỗng', async () => {
    serve(adminReturn({ status: 'RECEIVED', refundAmount: '230000.00', paymentGateway: 'VNPAY' }), {
      status: 'COMPLETED',
      refund: { status: 'SUCCEEDED', amount: '230000.00', reference: 'VNP-1' },
    });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền' }));
    const { dialog, confirm } = await dialogConfirm('Hoàn tiền');
    expect(dialog).toHaveTextContent(/Hoàn 230.000.* về VNPAY/);
    expect(within(dialog).queryByLabelText('Mã giao dịch chuyển khoản')).not.toBeInTheDocument();
    confirm();
    expect(await screen.findByText('Đã hoàn tiền; yêu cầu hoàn tất.')).toBeInTheDocument();
    expect(calls('POST', '/admin/returns/r1/refund')[0]![1].body).toEqual({});
    expect(screen.getByText('Đã hoàn')).toBeInTheDocument();
    expect(screen.getByText('VNP-1')).toBeInTheDocument();
  });

  it('UC-14.2/AC6 hoàn đơn COD: hiện tài khoản của khách, bắt buộc mã giao dịch đúng khuôn', async () => {
    serve(
      adminReturn({
        status: 'RECEIVED',
        refundMethod: 'BANK_TRANSFER',
        paymentGateway: 'COD',
        hasRefundAccount: true,
        refundAccount: {
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountHolder: 'NGUYEN VAN A',
        },
      }),
      { status: 'COMPLETED', refundAccount: null },
    );
    show('/admin/returns/r1');
    const account = (await screen.findByRole('heading', { name: 'Tài khoản nhận tiền' })).closest(
      'section',
    )!;
    expect(account).toHaveTextContent('0123456789');
    expect(within(account).getAllByRole('button', { name: /Sao chép/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tiền' }));
    const { dialog, confirm } = await dialogConfirm('Hoàn tiền');
    confirm();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Mã giao dịch gồm 4 đến 64');
    fireEvent.change(within(dialog).getByLabelText('Mã giao dịch chuyển khoản'), {
      target: { value: 'a b' },
    });
    confirm();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Mã giao dịch gồm 4 đến 64');
    expect(calls('POST', '/admin/returns/r1/refund')).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText('Mã giao dịch chuyển khoản'), {
      target: { value: 'FT26318.0001' },
    });
    confirm();
    expect(await screen.findByText('Đã hoàn tiền; yêu cầu hoàn tất.')).toBeInTheDocument();
    expect(calls('POST', '/admin/returns/r1/refund')[0]![1].body).toEqual({
      transferReference: 'FT26318.0001',
    });
    // Sau khi hoan tat tai khoan bi xoa o may chu: trang khong con hien so tai khoan.
    expect(screen.queryByText('0123456789')).not.toBeInTheDocument();
  });

  it('UC-14.2/E3 cổng chưa trả lời (503 REFUND_PENDING): báo chờ đối soát, giữ nguyên trạng thái', async () => {
    request.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') throw apiError(503, 'REFUND_PENDING');
      return adminReturn({ status: 'RECEIVED' });
    });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền' }));
    const { confirm } = await dialogConfirm('Hoàn tiền');
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lệnh hoàn chờ đối soát ở trang đơn hàng',
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hoàn tiền' })).toBeInTheDocument();
    expect(screen.getByText('Shop đã nhận hàng')).toBeInTheDocument();
  });

  it('UC-14.2/E3 cổng nhận lệnh nhưng chưa xác nhận (200, vẫn RECEIVED): không báo hoàn tất', async () => {
    serve(adminReturn({ status: 'RECEIVED' }), {
      refund: { status: 'PENDING', amount: '200000.00', reference: null },
    });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền' }));
    const { confirm } = await dialogConfirm('Hoàn tiền');
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Lệnh hoàn chờ đối soát ở trang đơn hàng',
    );
    expect(screen.queryByText('Đã hoàn tiền; yêu cầu hoàn tất.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoàn tiền' })).toBeInTheDocument();
    expect(screen.getByText('Đang chờ cổng xác nhận')).toBeInTheDocument();
  });

  it('UC-14.2/AC1 nút mở hộp biến mất sau khi duyệt: focus chuyển về thông báo kết quả', async () => {
    serve(adminReturn(), { status: 'APPROVED' });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const { confirm } = await dialogConfirm('Duyệt');
    confirm();
    const notice = await screen.findByText('Đã duyệt yêu cầu trả hàng.');
    await waitFor(() => expect(notice).toHaveFocus());
  });

  it('UC-14.2/AC7 hai quản trị viên bấm cùng lúc (409): báo đổi trạng thái và tải lại', async () => {
    let status: AdminReturn['status'] = 'APPROVED';
    request.mockImplementation(async (_path: string, options?: { method?: string }) => {
      if (options?.method === 'POST') {
        status = 'RECEIVED';
        throw apiError(409, 'RETURN_STATE_CHANGED');
      }
      return adminReturn({ status });
    });
    show('/admin/returns/r1');
    fireEvent.click(await screen.findByRole('button', { name: 'Đã nhận hàng' }));
    const { confirm } = await dialogConfirm('Đã nhận hàng');
    confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent('Yêu cầu vừa đổi trạng thái');
    expect(await screen.findByRole('button', { name: 'Hoàn tiền' })).toBeInTheDocument();
  });

  it('UC-14.2/AC1 chi tiết hiện email khách, ảnh mở cỡ đầy đủ và các món kèm số tiền hoàn', async () => {
    request.mockResolvedValue(
      adminReturn({
        media: [{ url: 'https://cdn.test/a.jpg' }],
        refundShipping: '30000.00',
        refundAmount: '230000.00',
      }),
    );
    show('/admin/returns/r1');
    expect(await screen.findByText('khach@example.test')).toBeInTheDocument();
    const photo = screen.getByRole('link', { name: 'Ảnh 1 (mở cỡ đầy đủ)' });
    expect(photo).toHaveAttribute('href', 'https://cdn.test/a.jpg');
    expect(photo).toHaveAttribute('target', '_blank');
    expect(screen.getByText('Hoàn phí vận chuyển')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FR-O1' })).toHaveAttribute('href', '/admin/orders/o1');
  });
});
