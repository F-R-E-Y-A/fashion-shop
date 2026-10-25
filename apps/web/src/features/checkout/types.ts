export type GatewayCode = 'VNPAY' | 'MOMO' | 'MOMO_ATM';
export interface GatewayOption {
  code: GatewayCode;
  label: string;
  configured: boolean;
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
  all: ['checkout'] as const,
  preview: (userId: string, addressId: string) => ['checkout', userId, addressId] as const,
};
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
}

export const orderStatuses: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã thanh toán · chờ shop xử lý',
  CANCELLED: 'Đã hủy / hết hạn',
  PAYMENT_REVIEW: 'Đã nhận tiền · cần shop đối soát',
};

/** Nhan ngan cho the danh sach; tieu de trang don van dung orderStatuses day du. */
export const orderBadges: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
  PAYMENT_REVIEW: 'Cần đối soát',
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
