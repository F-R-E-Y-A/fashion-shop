import { lazy } from 'react';

/** CUA DUY NHAT cua promotions feature tren web. */
export {
  type AdminPromotionDetail,
  type AdminPromotionItem,
  type AdminPromotionListResponse,
  adminPromotionsKeys,
  arePromotionFieldValuesEqual,
  type CreateAdminPromotionPayload,
  type DiscountType,
  doesPromotionMatchPayload,
  formatCurrencyVnd,
  formatDisplayDateTime,
  isComplexPromotion,
  promotionErrorText,
  type PromotionStatus,
  type UpdateAdminPromotionPayload,
} from './admin/admin-promotions.api.js';
export * from './admin/admin-vouchers.api.js';
export { AdminPromotionDetailPage } from './admin/AdminPromotionDetailPage.js';
export { AdminPromotionNewPage } from './admin/AdminPromotionNewPage.js';
export { AdminPromotionsPage } from './admin/AdminPromotionsPage.js';
export { useAdminPromotion, useAdminPromotions } from './admin/use-admin-promotions.js';
export * from './api/promotions.api.js';
export { BestPromotionBanner } from './components/BestPromotionBanner.js';
export { PromotionField } from './components/PromotionField.js';
export { VoucherModal } from './components/VoucherModal.js';
export { type AppliedPromotionState, useAppliedPromotion } from './hooks/useAppliedPromotion.js';

export const AdminVouchersPage = lazy(() =>
  import('./admin/AdminVouchersPage.js').then((m) => ({ default: m.AdminVouchersPage })),
);
export const AdminVoucherDetailPage = lazy(() =>
  import('./admin/AdminVoucherDetailPage.js').then((m) => ({ default: m.AdminVoucherDetailPage })),
);
export const AdminVoucherNewPage = lazy(() =>
  import('./admin/AdminVoucherNewPage.js').then((m) => ({ default: m.AdminVoucherNewPage })),
);
