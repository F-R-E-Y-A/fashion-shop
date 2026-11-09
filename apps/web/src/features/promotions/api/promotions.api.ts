import { apiGet, apiPost, apiRequest } from '@/core';

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
  expiresAt: string | null;
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
  availableVouchers: () => [...promotionKeys.all, 'vouchers', 'available'] as const,
  evaluate: (subtotal: string, count: number) =>
    [...promotionKeys.all, 'evaluate', subtotal, count] as const,
  activePromotions: () => [...promotionKeys.all, 'active'] as const,
};

export const getAvailableVouchers = ({ signal }: { signal?: AbortSignal } = {}): Promise<
  Voucher[]
> => apiGet<Voucher[]>('/promotions/vouchers/available', undefined, { signal });

export const applyVoucher = (code: string, subtotal: string): Promise<VoucherApplyResult> =>
  apiPost<VoucherApplyResult>('/promotions/vouchers/apply', { code, subtotal });

export const evaluateCart = (
  subtotal: string,
  items?: { variantId: string; categorySlug?: string; price: string; quantity: number }[],
  signal?: AbortSignal,
): Promise<EvaluatePromotionsResponse> =>
  apiRequest<EvaluatePromotionsResponse>('/promotions/evaluate', {
    method: 'POST',
    body: { subtotal, items },
    signal,
  });
