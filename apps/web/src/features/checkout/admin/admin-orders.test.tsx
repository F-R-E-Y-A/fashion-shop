import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import { adminOrderKeys } from './admin-orders.api.js';
import { AdminOrderDetailPage } from './AdminOrderDetailPage.js';
import { AdminOrdersPage } from './AdminOrdersPage.js';
import { base } from './test-support/order-fixture.js';

const { request, epoch } = vi.hoisted(() => ({ request: vi.fn(), epoch: { value: 1 } }));
vi.mock('@/features/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/account')>()),
  useAuth: () => ({
    user: { id: 'admin1' },
    authenticatedRequest: request,
    getSessionEpoch: () => epoch.value,
  }),
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
  epoch.value = 1;
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
  return client;
}

const apiError = (statusCode: number, message: string) =>
  new ApiError({ statusCode, code: 'TEST', message, path: '/x', timestamp: '' });

describe('PH-11 quản trị đơn hàng (ADR-038)', () => {
  it('UC-12.1/AC7 mặc định tab Cần xử lý; đổi tab gửi bộ lọc trạng thái và hiện từng dòng', async () => {
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

  it('UC-14.3/AC2 hoàn tiền một phần: hộp xác nhận điền sẵn số còn hoàn được, gửi số đã sửa và lý do', async () => {
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
      expect(request).toHaveBeenCalledWith(
        '/admin/payments/p1/refund',
        expect.objectContaining({
          method: 'POST',
          body: { amount: '100000', reason: 'Thiếu phụ kiện' },
        }),
      ),
    );
    expect(await screen.findByText('Cổng đã xác nhận hoàn tiền.')).toBeInTheDocument();
  });

  it('UC-12.2/AC3 COD đang giao: giao thất bại bắt buộc lý do; chốt lệnh hoàn chỉ hiện khi chốt được', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Đã giao, đã thu tiền' }));
    // Nut trong hop cung nhan voi nut tren trang.
    const delivered = await screen.findByRole('dialog');
    expect(
      within(delivered).getByRole('button', { name: 'Đã giao, đã thu tiền' }),
    ).toBeInTheDocument();
    fireEvent.click(within(delivered).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Hoàn tiền/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chốt lệnh hoàn' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Giao thất bại' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi giao thất bại' }));
    expect(within(dialog).getByText('Nhập nội dung trước khi xác nhận.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('/admin/orders/o1/delivery-failed', expect.anything());
  });

  it('UC-14.3/AC9 hoàn tiền gặp 5xx: báo chưa xác định kết quả, không in lỗi thô, đọc lại đơn (ADR-039)', async () => {
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
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Chưa xác định được kết quả: thao tác có thể đã được thực hiện/,
    );
    expect(screen.queryByText(/Bad Gateway/)).not.toBeInTheDocument();
    expect(refunds).toBe(1);
    await waitFor(() =>
      expect(request.mock.calls.filter(([path]) => path === '/admin/orders/o1')).toHaveLength(2),
    );
  });

  it('UC-12.1/AC10 409 từ máy chủ: giữ câu nghiệp vụ của máy chủ và báo đã tải lại', async () => {
    request.mockImplementation(async (path: string) => {
      if (!path.endsWith('/refund')) return base;
      throw apiError(409, 'Đang có lệnh hoàn chờ kết quả.');
    });
    show('/admin/orders/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hoàn tiền VNPAY' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hoàn tiền' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Đang có lệnh hoàn chờ kết quả. Hãy kiểm tra lại trạng thái đơn.',
    );
  });
});

describe('UC-02.1/AC6, AC8 — bảo vệ dữ liệu admin dùng chung (#57)', () => {
  it('không bắt đầu POST đã xếp hàng nếu epoch đổi trước khi mutationFn chạy', async () => {
    request.mockResolvedValue({ ...base, actions: { ...base.actions, markDelivered: true } });
    show('/admin/orders/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Đã giao' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Đã giao' }));
      epoch.value += 1;
    });
    expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });

  it.each(['detail', 'list'] as const)(
    'UC-12.1/AC8 GET %s nhận 403 phải ẩn dữ liệu khách và xóa cache',
    async (source) => {
      const page = {
        items: [
          {
            ...base,
            itemCount: 1,
            paymentStatus: 'SUCCEEDED',
            gateway: 'VNPAY',
            refundedAmount: '0',
            refundPending: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      request.mockResolvedValue(source === 'detail' ? base : page);
      const client = show(source === 'detail' ? '/admin/orders/o1' : '/admin/orders');
      await screen.findByText(base.customerEmail);
      request.mockRejectedValue(apiError(403, 'Forbidden'));
      await act(async () => {
        await client.invalidateQueries({ queryKey: adminOrderKeys.all('admin1') });
      });
      expect(screen.queryByText(base.customerEmail)).not.toBeInTheDocument();
      expect(
        client
          .getQueriesData({ queryKey: adminOrderKeys.all('admin1') })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
    },
  );

  it('UC-02.1/AC14 đổi tab không giữ dòng của tập cũ trong khi GET mới chờ', async () => {
    request.mockResolvedValue({
      items: [
        {
          ...base,
          itemCount: 1,
          paymentStatus: 'SUCCEEDED',
          gateway: 'VNPAY',
          refundedAmount: '0',
          refundPending: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    show('/admin/orders?tab=delivered');
    await screen.findByRole('link', { name: base.orderCode });
    request.mockImplementation(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: 'Chờ xác nhận COD' }));
    expect(screen.queryByRole('link', { name: base.orderCode })).not.toBeInTheDocument();
    expect(screen.getByText('Đang tải đơn hàng…')).toBeInTheDocument();
  });
});
