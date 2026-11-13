import { sessionQueryKeys } from '@/core';

export type GatewayCode = 'VNPAY' | 'MOMO' | 'MOMO_ATM' | 'COD';
export interface GatewayOption {
  code: GatewayCode;
  label: string;
  configured: boolean;
  /** COD bi tat cho don/khach nay (tran gia tri, tien su giao that bai) — ADR-038. */
  unavailableReason?: string;
}
export interface Quote {
  fingerprint: string;
  address: {
    id: string;
    recipientName: string;
    phone: string;
    detailAddress: string;
    commune: string;
    province: string;
  };
  items: {
    variantId: string;
    name: string;
    variantLabel: string;
    price: string;
    quantity: number;
    imageUrl?: string | null;
    productSlug?: string;
    subtotal?: string;
  }[];
  subtotalAmount: string;
  discountAmount: string;
  shippingFeeAmount: string;
  totalAmount: string;
  paymentConfigured: boolean;
  gateways?: GatewayOption[];
  holdMinutes: number;
  /** Link cong het han som hon hold; phan con lai de cho IPN/query. */
  payMinutes?: number;
  pendingOrder?: { id: string; orderCode: string } | null;
}
export const checkoutKeys = {
  all: sessionQueryKeys.scope('checkout'),
  preview: (userId: string, addressId: string) => [...checkoutKeys.all, userId, addressId] as const,
};
export const orderKeys = {
  all: sessionQueryKeys.scope('orders'),
  detail: (userId: string, id: string) => [...orderKeys.all, userId, id] as const,
  list: (userId: string) => [...orderKeys.all, userId, 'list'] as const,
};
export interface ShipmentView {
  id: string;
  carrierName: string | null;
  trackingNumber: string | null;
  status: 'PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
  createdAt: string;
  updatedAt: string;
}

export interface OrderView {
  checkoutFingerprint: string | null;
  id: string;
  orderCode: string;
  status: string;
  paymentDueAt: string | null;
  createdAt: string;
  address: Quote['address'];
  subtotalAmount: string;
  discountAmount: string;
  shippingFeeAmount: string;
  totalAmount: string;
  items: {
    variantId: string;
    quantity: number;
    price: string;
    snapshot: { name: string; variantLabel: string; imageUrl: string | null; productSlug: string };
  }[];
  payments: {
    id: string;
    gateway?: string | null;
    reference: string | null;
    status: string;
    expiresAt?: string | null;
    checkoutUrl: string | null;
  }[];
  /** Tong da hoan; may chu luon gui, test cu co the bo qua. */
  refundedAmount?: string;
  refundPending?: boolean;
  /** Khach huy duoc luc nay; cancelRefunds: huy se hoan tien tu dong (ADR-038). */
  canCancel?: boolean;
  cancelRefunds?: boolean;
  shipment?: ShipmentView | null;
}

export const orderStatuses: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'Chờ xử lý · thanh toán khi nhận hàng',
  CONFIRMED: 'Đã thanh toán · chờ shop xử lý',
  PROCESSING: 'Shop đang chuẩn bị và giao hàng',
  SHIPPED: 'Đang giao hàng',
  DELIVERED: 'Đã giao hàng',
  CANCELLED: 'Đã hủy / hết hạn',
  PAYMENT_REVIEW: 'Đã nhận tiền · cần shop đối soát',
  PARTIALLY_REFUNDED: 'Đã hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
};

/** Nhan ngan cho the danh sach; tieu de trang don van dung orderStatuses day du. */
export const orderBadges: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'COD · chờ xử lý',
  CONFIRMED: 'Đã thanh toán',
  PROCESSING: 'Đang giao',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  PAYMENT_REVIEW: 'Cần đối soát',
  PARTIALLY_REFUNDED: 'Hoàn một phần',
  REFUNDED: 'Đã hoàn tiền',
};

/** Persist only a random request key, never an address, token or payment URL. */
export function checkoutKey(
  userId: string,
  fingerprint: string,
  gateway: GatewayCode = 'VNPAY',
): string {
  const storageKey = `freya:checkout:${userId}:${fingerprint}${gateway === 'MOMO' ? ':MOMO' : ''}`;
  const raw = sessionStorage.getItem(storageKey);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as { key: string; expires: number };
      if (saved.expires > Date.now()) return saved.key;
    } catch {
      /* Old or corrupt value: generate a new key. */
    }
  }
  const key = crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ key, expires: Date.now() + 15 * 60_000 }));
  return key;
}

export function forgetCheckout(userId: string, fingerprint: string) {
  sessionStorage.removeItem(`freya:checkout:${userId}:${fingerprint}`);
  sessionStorage.removeItem(`freya:checkout:${userId}:${fingerprint}:MOMO`);
}
