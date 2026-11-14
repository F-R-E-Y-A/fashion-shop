import { lazy } from 'react';

/**
 * CUA DUY NHAT cua feature returns. checkout import ReturnOrderPrompt tu day; returns khong import
 * nguoc checkout (lien ket sang don hang dung duong dan, khong dung ma).
 */
export { ReturnOrderPrompt } from './ReturnOrderPrompt.js';

export const MyReturnsPage = lazy(() =>
  import('./MyReturnsPage.js').then((m) => ({ default: m.MyReturnsPage })),
);
export const ReturnDetailPage = lazy(() =>
  import('./ReturnDetailPage.js').then((m) => ({ default: m.ReturnDetailPage })),
);
export const AdminReturnsPage = lazy(() =>
  import('./AdminReturnsPage.js').then((m) => ({ default: m.AdminReturnsPage })),
);
export const AdminReturnDetailPage = lazy(() =>
  import('./AdminReturnDetailPage.js').then((m) => ({ default: m.AdminReturnDetailPage })),
);
