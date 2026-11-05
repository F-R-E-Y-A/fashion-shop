import { ApiError, classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

import type { OrderView } from '../types.js';

/** Hinh dang GET /api/admin/orders (Swagger `admin-orders`). */
export interface AdminOrderSummary {
  id: string;
  orderCode: string;
  status: string;
  createdAt: string;
  customerEmail: string;
  totalAmount: string;
  itemCount: number;
  gateway: string | null;
  paymentStatus: string | null;
  refundedAmount: string;
  refundPending: boolean;
}
export interface AdminOrderPage {
  items: AdminOrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export interface PaymentLedger {
  paymentId: string;
  gateway: string | null;
  status: string;
  amount: string;
  refundedAmount: string;
  /** null: khong hoan tay duoc luc nay (CONFIRMED dung cancelRefund, chua thu, da hoan du, lenh dang cho). */
  refundableAmount: string | null;
  refunds: { id: string; amount: string; at: string; reason: string | null }[];
  pendingRefund: {
    id: string;
    amount: string | null;
    createdAt: string;
    lastError: string | null;
    resolvable: boolean;
  } | null;
}
export interface AdminOrder extends OrderView {
  userId: string | null;
  customerEmail: string;
  history: { status: string; at: string; actorUserId: string | null }[];
  ledgers: PaymentLedger[];
  actions: {
    confirmCod: boolean;
    startProcessing: boolean;
    /** Don online da tra chua xu ly: tra kho va hoan toan bo (thay cho hoan tay). */
    cancelRefund: boolean;
    markDelivered: boolean;
    deliveryFailed: boolean;
  };
}

/** Tab danh sach: moi tab la mot bo loc may chu; "Can xu ly" dung attention=true. */
export const ORDER_TABS = [
  { key: 'attention', label: 'Cần xử lý', query: 'attention=true' },
  { key: 'cod', label: 'Chờ xác nhận COD', query: 'status=PENDING_CONFIRMATION' },
  { key: 'paid', label: 'Đã thanh toán', query: 'status=CONFIRMED' },
  { key: 'shipping', label: 'Đang giao', query: 'status=PROCESSING,SHIPPED' },
  { key: 'delivered', label: 'Đã giao', query: 'status=DELIVERED' },
  { key: 'refunded', label: 'Hoàn tiền', query: 'status=PARTIALLY_REFUNDED,REFUNDED' },
  { key: 'cancelled', label: 'Đã hủy', query: 'status=CANCELLED' },
  { key: 'all', label: 'Tất cả', query: '' },
] as const;
export type OrderTab = (typeof ORDER_TABS)[number]['key'];

export const adminOrderKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('orders'), actorId] as const,
  list: (actorId: string, tab: string, q: string, page: number) =>
    [...adminOrderKeys.all(actorId), 'list', tab, q, page] as const,
  detail: (actorId: string, id: string) => [...adminOrderKeys.all(actorId), 'detail', id] as const,
};

export function listPath(tab: OrderTab, q: string, page: number) {
  const params = new URLSearchParams(ORDER_TABS.find((item) => item.key === tab)?.query ?? '');
  if (q.trim()) params.set('q', q.trim());
  params.set('page', String(page));
  params.set('pageSize', '20');
  return `/admin/orders?${params.toString()}`;
}

export const gatewayLabel = (code?: string | null) =>
  code === 'MOMO'
    ? 'MoMo'
    : code === 'MOMO_ATM'
      ? 'MoMo (thẻ)'
      : code === 'COD'
        ? 'COD'
        : code === 'VNPAY'
          ? 'VNPAY'
          : '—';

export const paymentLabels: Record<string, string> = {
  PENDING: 'Chờ thu',
  PROCESSING: 'Đang xử lý',
  SUCCEEDED: 'Đã thu',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

/** Tong mau cua huy hieu trang thai don (ui/AdminKit); trang thai khong co o day dung mau trung tinh. */
export const orderTones: Record<string, 'accent' | 'danger' | 'pending' | 'muted'> = {
  PENDING_PAYMENT: 'pending',
  PENDING_CONFIRMATION: 'pending',
  CONFIRMED: 'accent',
  DELIVERED: 'accent',
  PAYMENT_REVIEW: 'danger',
  CANCELLED: 'muted',
  PARTIALLY_REFUNDED: 'muted',
  REFUNDED: 'muted',
};

const UNKNOWN_RESULT =
  'Chưa xác định được kết quả: thao tác có thể đã được thực hiện. Hãy kiểm tra trạng thái đơn trước khi thử tiếp.';

/**
 * Cau bao loi theo nhom (core/request-errors, LOG#adr-039), khong in message tho cua loi mang.
 * 409/4xx giu cau cua may chu vi do la luat nghiep vu da viet tieng Viet (vd "Chỉ đánh dấu đã giao…").
 */
export function adminOrderErrorText(error: unknown, target: RequestTarget): string {
  const kind = classifyRequestError(error, target);
  switch (kind) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
    case 'forbidden':
      return 'Tài khoản của bạn không còn quyền quản trị.';
    case 'not-found':
      return 'Không tìm thấy đơn hàng này.';
    case 'invalid':
      return 'Bộ lọc đơn hàng không hợp lệ.';
    case 'conflict':
    case 'rejected': {
      const text = error instanceof ApiError ? error.message : 'Máy chủ từ chối thao tác này.';
      return kind === 'conflict' ? `${text} Hãy kiểm tra lại trạng thái đơn.` : text;
    }
    case 'unknown':
      return UNKNOWN_RESULT;
    case 'unavailable':
      return target === 'list'
        ? 'Không tải được danh sách đơn hàng. Kiểm tra kết nối rồi thử lại.'
        : 'Không tải được đơn hàng. Kiểm tra kết nối rồi thử lại.';
  }
}
