import type { AdminOrder } from '../admin-orders.api.js';

/** Đơn tổng hợp dùng chung cho các bài quản trị, không phải dữ liệu thật. */
export const base: AdminOrder = {
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
