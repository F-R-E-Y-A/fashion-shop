export const VoucherStatus = {
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
} as const;

export type VoucherStatus = (typeof VoucherStatus)[keyof typeof VoucherStatus];

export const PromotionStatus = {
  INACTIVE: 'INACTIVE',
  ACTIVE: 'ACTIVE',
} as const;

export type PromotionStatus = (typeof PromotionStatus)[keyof typeof PromotionStatus];

export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];
