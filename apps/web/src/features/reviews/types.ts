import { sessionQueryKeys } from '@/core';

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OrderReviewItemDetails {
  id: string;
  rating: number;
  content: string | null;
  moderationStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderReviewItemContext {
  orderItemId: string;
  productVariantId: string;
  productId: string;
  eligible: boolean;
  reasonCode: 'NOT_DELIVERED' | 'ALREADY_REVIEWED' | null;
  review: OrderReviewItemDetails | null;
}

export interface OrderReviewsContext {
  orderId: string;
  items: OrderReviewItemContext[];
}

export interface PublicReviewItem {
  id: string;
  rating: number;
  content: string | null;
  createdAt: string;
}

export interface PublicReviewsResponse {
  items: PublicReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const reviewKeys = {
  all: sessionQueryKeys.scope('reviews'),
  orderContext: (userId: string, orderId: string) =>
    [...reviewKeys.all, userId, orderId, 'context'] as const,
  publicList: (slug: string, page: number, pageSize = 12) =>
    ['public-reviews', slug, page, pageSize] as const,
};
