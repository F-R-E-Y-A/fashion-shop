import { lazy } from 'react';

/** CUA DUY NHAT cua promotions feature tren web. */
export * from './admin/admin-vouchers.api.js';
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
