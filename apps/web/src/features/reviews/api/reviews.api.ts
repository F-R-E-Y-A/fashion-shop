import { apiGet, type ApiRequestOptions } from '@/core';

import type {
  OrderReviewItemDetails,
  OrderReviewsContext,
  PublicReviewsResponse,
} from '../types.js';

export type AuthenticatedRequest = <T>(
  path: string,
  options?: Omit<ApiRequestOptions, 'accessToken'>,
) => Promise<T>;

export async function getOrderReviewsContext(
  request: AuthenticatedRequest,
  orderId: string,
  signal?: AbortSignal,
): Promise<OrderReviewsContext> {
  return request<OrderReviewsContext>(`/orders/${encodeURIComponent(orderId)}/reviews`, { signal });
}

export async function submitReview(
  request: AuthenticatedRequest,
  input: {
    orderItemId: string;
    rating: number;
    content?: string | null;
  },
  signal?: AbortSignal,
): Promise<OrderReviewItemDetails> {
  return request<OrderReviewItemDetails>('/reviews', {
    method: 'POST',
    body: input,
    signal,
  });
}

export async function getPublicProductReviews(
  slug: string,
  page = 1,
  pageSize = 12,
): Promise<PublicReviewsResponse> {
  return apiGet<PublicReviewsResponse>(`/products/${encodeURIComponent(slug)}/reviews`, {
    page,
    pageSize,
  });
}
