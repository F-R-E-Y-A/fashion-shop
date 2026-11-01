import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import { CheckoutPage } from './CheckoutPage.js';
import { OrderPage, OrdersPage } from './OrderPage.js';
import { checkoutKey, type OrderView, type Quote } from './types.js';

const { request, addresses, createAddress, AddressFormStub } = vi.hoisted(() => ({
  request: vi.fn(),
  addresses: vi.fn(),
  createAddress: vi.fn(),
  AddressFormStub: ({ onSave }: { onSave: (data: unknown) => Promise<void> }) =>
    createElement('button', { type: 'button', onClick: () => void onSave({}) }, 'Lưu địa chỉ'),
}));
vi.mock('@/features/account', () => ({
  useAuth: () => ({ user: { id: 'u1' }, authenticatedRequest: request }),
  listAddresses: addresses,
  addressKeys: { list: (id: string) => ['addresses', id] },
  createAddress,
  AddressForm: AddressFormStub,
}));
const quote: Quote = {
  fingerprint: 'a'.repeat(64),
  address: {
    id: 'a1',
    recipientName: 'Bảo',
    phone: '0901234567',
    detailAddress: '123 đường thử',
    commune: 'Phường thử',
    province: 'Tỉnh thử',
  },
  items: [
    { variantId: 'v1', name: 'Áo thử', variantLabel: 'Đen / M', price: '200000', quantity: 1 },
  ],
  subtotalAmount: '200000.00',
  discountAmount: '0.00',
  shippingFeeAmount: '30000.00',
  totalAmount: '230000.00',
  paymentConfigured: true,
  holdMinutes: 15,
};
function order(status = 'PENDING_PAYMENT'): OrderView {
  return {
    id: 'o1',
    checkoutFingerprint: quote.fingerprint,
    orderCode: 'FRTEST',
    status,
    paymentDueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    address: quote.address,
    subtotalAmount: quote.subtotalAmount,
    discountAmount: '0.00',
    shippingFeeAmount: '30000.00',
    totalAmount: quote.totalAmount,
    items: [],
    payments: [{ id: 'p1', reference: 'REF1', status: 'PENDING', checkoutUrl: null }],
  };
}
function show(path = '/thanh-toan') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/thanh-toan" element={<CheckoutPage />} />
          <Route path="/thanh-toan/ket-qua" element={<OrderPage />} />
          <Route path="/don-hang/:id" element={<OrderPage />} />
          <Route path="/tai-khoan/don-hang" element={<OrdersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  request.mockReset();
  addresses.mockReset();
  sessionStorage.clear();
  addresses.mockResolvedValue([
    {
      id: 'a1',
      recipientName: 'Bảo',
      phone: '0901234567',
      detailAddress: '123 đường thử',
      isDefault: true,
      administrativeArea: { name: 'Phường thử', province: { name: 'Tỉnh thử' } },
    },
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('PH-11 checkout UI', () => {
  it('chưa có địa chỉ thì mở sẵn form thêm ngay; lưu xong tự chọn địa chỉ mới', async () => {
    addresses.mockResolvedValue([]);
    createAddress.mockResolvedValue({ id: 'a9' });
    request.mockResolvedValue(quote);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu địa chỉ' }));
    expect(await screen.findByRole('radio', { name: 'VNPAY' })).toBeChecked();
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/checkout/preview', {
        method: 'POST',
        body: { addressId: 'a9' },
      }),
    );
    expect(createAddress).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Lưu địa chỉ' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã thêm địa chỉ giao hàng.')).toBeInTheDocument();
  });
  it('chỉ hiện VNPAY khi MoMo chưa được cấu hình', async () => {
    request.mockResolvedValue({
      ...quote,
      gateways: [
        { code: 'VNPAY', label: 'VNPAY', configured: true },
        { code: 'MOMO', label: 'MoMo', configured: false },
      ],
    });
    show();
    expect(await screen.findByRole('radio', { name: 'VNPAY' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /MoMo/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận và sang VNPAY' })).toBeEnabled();
  });
  it('hiện cả MoMo ví và MoMo thẻ khi hai biến thể được cấu hình', async () => {
    request.mockResolvedValue({
      ...quote,
      gateways: [
        { code: 'VNPAY', label: 'VNPAY', configured: true },
        { code: 'MOMO', label: 'MoMo', configured: true },
        { code: 'MOMO_ATM', label: 'MoMo — thẻ ATM/thẻ quốc tế', configured: true },
      ],
    });
    show();
    expect(await screen.findByRole('radio', { name: /MoMo — thẻ/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'MoMo' })).toBeEnabled();
  });
  it('chọn COD tạo đơn chờ xử lý, không có link cổng hay đếm ngược', async () => {
    const codOrder = {
      ...order('PENDING_CONFIRMATION'),
      paymentDueAt: null,
      payments: [
        {
          id: 'c1',
          gateway: 'COD',
          reference: 'CODREF1',
          status: 'PENDING',
          checkoutUrl: null,
          expiresAt: null,
        },
      ],
    };
    request.mockImplementation(async (path: string) => {
      if (path === '/checkout/orders' || path === '/orders/o1') return codOrder;
      return {
        ...quote,
        gateways: [
          { code: 'VNPAY', label: 'VNPAY', configured: true },
          { code: 'COD', label: 'COD — thanh toán khi nhận hàng', configured: true },
        ],
      };
    });
    show();
    fireEvent.click(await screen.findByRole('radio', { name: /COD/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt hàng (COD)' }));
    expect(
      await screen.findByRole('heading', { name: 'Chờ xử lý · thanh toán khi nhận hàng' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Thu khi nhận hàng')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
  });
  it('còn đơn chờ thì chỉ dẫn tới đơn đó, không cho tạo đơn thứ hai', async () => {
    request.mockResolvedValue({
      ...quote,
      payMinutes: 12,
      pendingOrder: { id: 'o1', orderCode: 'FRCU' },
    });
    show();
    expect(await screen.findByRole('link', { name: 'tiếp tục hoặc hủy đơn đó' })).toHaveAttribute(
      'href',
      '/don-hang/o1',
    );
    expect(screen.getByText(/trong 12\s+phút; hàng được giữ 15 phút/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận và sang VNPAY' })).toBeDisabled();
  });
  it('đếm ngược theo hạn link cổng, sớm hơn hạn giữ hàng', async () => {
    const pending = order();
    pending.payments = [
      {
        id: 'p1',
        reference: 'REF1',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 12 * 60_000).toISOString(),
        checkoutUrl: 'https://sandbox.vnpayment.vn/pay',
      },
    ];
    request.mockResolvedValue(pending);
    show('/don-hang/o1');
    expect(await screen.findByRole('timer')).toHaveTextContent(/Thời gian thanh toán còn 1[12]:/);
  });
  it('attempt thất bại phải tạo attempt mới, không mở lại URL VNPAY đã thất bại', async () => {
    const failed = order();
    failed.payments = [
      {
        id: 'failed',
        reference: 'OLD',
        status: 'FAILED',
        checkoutUrl: 'https://sandbox.vnpayment.vn/old',
      },
    ];
    const retried = order();
    retried.payments = [
      {
        id: 'new',
        reference: 'NEW',
        status: 'PENDING',
        checkoutUrl: 'https://sandbox.vnpayment.vn/new',
      },
      ...failed.payments,
    ];
    request.mockImplementation(async (path: string) =>
      path.endsWith('/payments') ? retried : failed,
    );
    show('/don-hang/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại thanh toán' }));
    expect(await screen.findByRole('link', { name: 'Tiếp tục thanh toán VNPAY' })).toHaveAttribute(
      'href',
      'https://sandbox.vnpayment.vn/new',
    );
    expect(request).toHaveBeenCalledWith(
      '/orders/o1/payments',
      expect.objectContaining({ method: 'POST', body: { idempotencyKey: expect.any(String) } }),
    );
  });
  it('chọn MoMo gửi đúng gateway, không dùng lại idempotency key của VNPAY', async () => {
    request.mockImplementation(async (path: string) => {
      if (path === '/checkout/orders') return order();
      return {
        ...quote,
        gateways: [
          { code: 'VNPAY', label: 'VNPAY', configured: true },
          { code: 'MOMO', label: 'MoMo', configured: true },
        ],
      };
    });
    show();
    fireEvent.click(await screen.findByRole('radio', { name: 'MoMo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận và sang MoMo' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        '/checkout/orders',
        expect.objectContaining({ body: expect.objectContaining({ gateway: 'MOMO' }) }),
      ),
    );
    expect(checkoutKey('u1', quote.fingerprint, 'MOMO')).not.toBe(
      checkoutKey('u1', quote.fingerprint, 'VNPAY'),
    );
  });
  it('return MoMo resultCode=0 chỉ dùng orderId để tìm đơn, không tự xác nhận tiền', async () => {
    request.mockResolvedValue(order());
    show('/thanh-toan/ket-qua?orderId=MOMOREF&resultCode=0');
    expect(await screen.findByRole('heading', { name: 'Chờ thanh toán' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/orders/by-payment/MOMOREF');
  });
  it('khuyến mãi trống và không cho thanh toán khi chưa cấu hình gateway', async () => {
    request.mockResolvedValue({ ...quote, paymentConfigured: false });
    show();
    expect(await screen.findByRole('button', { name: 'Xác nhận và sang VNPAY' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Khuyến mãi' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Khuyến mãi' })).toBeDisabled();
    expect(screen.getByText(/Cổng VNPAY chưa sẵn sàng/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      '/checkout/preview',
      expect.objectContaining({ body: { addressId: 'a1' } }),
    );
  });
  it('chưa có địa chỉ thì mở sẵn form thêm tại chỗ, không gọi preview hay tạo đơn', async () => {
    addresses.mockResolvedValue([]);
    show();
    expect(
      await screen.findByText('Chưa có địa chỉ giao hàng. Thêm địa chỉ để tiếp tục.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu địa chỉ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sổ địa chỉ' })).toHaveAttribute(
      'href',
      '/tai-khoan/dia-chi',
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('quote409 tải lại thông tin mới và chờ khách xác nhận lại; không tự submit tiếp', async () => {
    let current = quote;
    request.mockImplementation(async (path: string) => {
      if (path === '/checkout/orders') {
        current = { ...quote, fingerprint: 'b'.repeat(64), totalAmount: '250000.00' };
        throw new Error('Giá đã đổi');
      }
      return current;
    });
    show();
    const button = await screen.findByRole('button', { name: 'Xác nhận và sang VNPAY' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Giá đã đổi');
    await waitFor(() => expect(button).toBeEnabled());
    expect(request.mock.calls.filter(([path]) => path === '/checkout/orders')).toHaveLength(1);
    expect(
      request.mock.calls.find(([path]) => path === '/checkout/orders')?.[1].body,
    ).toMatchObject({ fingerprint: quote.fingerprint, idempotencyKey: expect.any(String) });
  });
  it('return URL báo00 vẫn hiện pending nếu database chưa xác nhận', async () => {
    request.mockResolvedValue(order());
    show('/thanh-toan/ket-qua?vnp_TxnRef=REF1&vnp_ResponseCode=00&vnp_TransactionStatus=00');
    expect(await screen.findByRole('heading', { name: 'Chờ thanh toán' })).toBeInTheDocument();
    expect(screen.queryByText('Đã thanh toán · chờ shop xử lý')).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/orders/by-payment/REF1');
  });
  it('return tự đối soát qua backend, kết quả server quyết định dù query trình duyệt báo hủy', async () => {
    request.mockImplementation(async (path: string) =>
      path.endsWith('/reconcile') ? order('CONFIRMED') : order(),
    );
    show('/thanh-toan/ket-qua?vnp_TxnRef=REF1&vnp_ResponseCode=24');
    expect(
      await screen.findByRole('heading', { name: 'Đã thanh toán · chờ shop xử lý' }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/orders/o1/reconcile', {
      method: 'POST',
      body: { params: { vnp_TxnRef: 'REF1', vnp_ResponseCode: '24' } },
    });
    expect(request.mock.calls.filter(([path]) => path.endsWith('/reconcile'))).toHaveLength(1);
  });
  it('quay về từ cổng: tự đối soát ngầm, đơn nhảy đã thanh toán, không cần thao tác tay', async () => {
    request.mockImplementation(async (path: string) =>
      path.endsWith('/reconcile') ? order('CONFIRMED') : order(),
    );
    const key = checkoutKey('u1', quote.fingerprint);
    expect(checkoutKey('u1', quote.fingerprint)).toBe(key);
    show('/thanh-toan/ket-qua?vnp_TxnRef=REF1');
    expect(
      await screen.findByRole('heading', { name: 'Đã thanh toán · chờ shop xử lý' }),
    ).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/orders/by-payment/REF1');
    expect(request).toHaveBeenCalledWith('/orders/o1/reconcile', {
      method: 'POST',
      body: { params: { vnp_TxnRef: 'REF1' } },
    });
    expect(screen.queryByRole('button', { name: 'Hủy đơn' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(sessionStorage.getItem(`freya:checkout:u1:${quote.fingerprint}`)).toBeNull(),
    );
  });
  it('tiền đến muộn hiện hướng xử lý, không cho thanh toán lại', async () => {
    request.mockResolvedValue(order('PAYMENT_REVIEW'));
    show('/don-hang/o1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thanh toán lại');
    expect(screen.queryByRole('button', { name: 'Thử lại thanh toán' })).not.toBeInTheDocument();
  });
  it('đơn chờ giữ đơn vị cuối: preview chỉ sang đơn đang chờ, không bảo khách chọn lại giỏ', async () => {
    request.mockRejectedValue(
      new ApiError({
        statusCode: 409,
        code: 'PENDING_ORDER_EXISTS',
        message: 'Bạn còn đơn FR1 đang chờ thanh toán.',
        path: '/api/checkout/preview',
        timestamp: '',
      }),
    );
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn còn đơn FR1');
    expect(screen.getByRole('link', { name: 'Xem đơn đang chờ' })).toHaveAttribute(
      'href',
      '/tai-khoan/don-hang',
    );
  });
  it('danh sách đơn: thẻ có mã, nhãn trạng thái ngắn, tổng tiền; rỗng thì mời mua sắm', async () => {
    request.mockResolvedValueOnce([order('CONFIRMED')]);
    show('/tai-khoan/don-hang');
    expect(await screen.findByRole('link', { name: 'FRTEST' })).toHaveAttribute(
      'href',
      '/don-hang/o1',
    );
    expect(screen.getByText('Đã thanh toán')).toBeInTheDocument();
    expect(screen.getByText('230.000 ₫')).toBeInTheDocument();
  });
  it('danh sách đơn rỗng có lời mời mua sắm', async () => {
    request.mockResolvedValueOnce([]);
    show('/tai-khoan/don-hang');
    expect(await screen.findByText('Bạn chưa có đơn hàng')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu mua sắm' })).toHaveAttribute('href', '/');
  });
  it('không có nút kiểm tra thanh toán thủ công ở mọi trạng thái; đối soát do hệ thống tự làm', async () => {
    request.mockResolvedValue(order('CANCELLED'));
    show('/don-hang/o1');
    await screen.findByText('Đã hủy / hết hạn');
    expect(
      screen.queryByRole('button', { name: 'Kiểm tra lại thanh toán' }),
    ).not.toBeInTheDocument();
  });
  it('đơn chờ thanh toán chỉ còn nút tiếp tục/thử lại và hủy đơn', async () => {
    request.mockResolvedValue(order());
    show('/don-hang/o1');
    expect(await screen.findByRole('button', { name: 'Hủy đơn' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Kiểm tra lại thanh toán' }),
    ).not.toBeInTheDocument();
  });
  it('hủy đơn phải qua xác nhận; từ chối thì không gửi request hủy', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    request.mockResolvedValue(order('PENDING_PAYMENT'));
    show('/don-hang/o1');
    fireEvent.click(await screen.findByRole('button', { name: 'Hủy đơn' }));
    expect(confirm).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalledWith('/orders/o1/cancel', expect.anything());
    confirm.mockRestore();
  });
  it('giỏ chưa chọn món thì dẫn về giỏ hàng chọn mua thay vì báo lỗi', async () => {
    request.mockRejectedValue(
      new ApiError({
        statusCode: 422,
        code: 'SELECTION_REQUIRED',
        message: 'Chọn sản phẩm đủ tồn kho trong giỏ trước khi thanh toán.',
        path: '/api/checkout/preview',
        timestamp: new Date().toISOString(),
      }),
    );
    show();
    expect(await screen.findByText('Chưa chọn sản phẩm để thanh toán')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về giỏ hàng chọn mua' })).toHaveAttribute(
      'href',
      '/gio-hang',
    );
  });
});
