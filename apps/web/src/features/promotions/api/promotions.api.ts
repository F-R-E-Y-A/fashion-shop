import { apiGet, apiRequest } from '@/core';

export interface Voucher {
  id: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'DEPLETED';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  maxDiscountAmount: string | null;
  minOrderAmount: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usageCount: number;
  startsAt: string | null;
  endsAt: string | null;
}

export interface VoucherApplyResult {
  valid: boolean;
  code: string;
  voucherId: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  discountAmount: string;
  finalAmount: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  message?: string;
}

export interface EvaluatedPromotionItem {
  promotionId: string;
  name: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'TIERED';
  discountAmount: string;
  finalAmount: string;
  breakdown?: Record<string, unknown>;
}

export interface EvaluatePromotionsResponse {
  subtotal: string;
  applicablePromotions: EvaluatedPromotionItem[];
  bestPromotion?: EvaluatedPromotionItem;
}

export const promotionKeys = {
  all: ['promotions'] as const,
  availableVouchers: (userId?: string) =>
    [...promotionKeys.all, 'vouchers', 'available', userId ?? 'guest'] as const,
  evaluate: (subtotal: string, count: number, itemsSignature = '', userId?: string) =>
    [...promotionKeys.all, 'evaluate', subtotal, count, itemsSignature, userId ?? 'guest'] as const,
  activePromotions: () => [...promotionKeys.all, 'active'] as const,
};

export const getAvailableVouchers = ({ signal }: { signal?: AbortSignal } = {}): Promise<
  Voucher[]
> => apiGet<Voucher[]>('/promotions/vouchers/available', undefined, { signal });

export const applyVoucher = (
  code: string,
  subtotal: string,
  signal?: AbortSignal,
): Promise<VoucherApplyResult> =>
  apiRequest<VoucherApplyResult>('/promotions/vouchers/apply', {
    method: 'POST',
    body: { code, subtotal },
    signal,
  });

export const evaluateCart = (
  subtotal: string,
  items?: {
    variantId: string;
    categorySlug?: string;
    parentCategorySlug?: string | null;
    price: string;
    quantity: number;
  }[],
  signal?: AbortSignal,
): Promise<EvaluatePromotionsResponse> =>
  apiRequest<EvaluatePromotionsResponse>('/promotions/evaluate', {
    method: 'POST',
    body: { subtotal, items },
    signal,
  });
