import { lazy } from 'react';

/**
 * CUA DUY NHAT cua feature reviews (ADR-054). products va checkout import tu day; reviews khong
 * import nguoc products hay checkout.
 */
export { ProductReviews } from './ProductReviews.js';
export { ReviewOrderPrompt } from './ReviewOrderPrompt.js';
export { RatingBadge, Stars } from './Stars.js';

export const MyReviewsPage = lazy(() =>
  import('./MyReviewsPage.js').then((m) => ({ default: m.MyReviewsPage })),
);
export const AdminReviewsPage = lazy(() =>
  import('./AdminReviewsPage.js').then((m) => ({ default: m.AdminReviewsPage })),
);
