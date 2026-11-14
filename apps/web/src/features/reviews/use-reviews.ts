import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  apiGet,
  apiRequest,
  type ApiRequestOptions,
  postExternalForm,
  requestErrorCode,
  shouldRetryRequest,
} from '@/core';
import { useAuth, useOptionalAuth } from '@/features/account';

import {
  type HelpfulVote,
  type MyReview,
  type MyReviewPage,
  type ReportReason,
  type ReviewableItem,
  type ReviewInput,
  reviewKeys,
  type ReviewListParams,
  reviewListPath,
  type ReviewPage,
  type ReviewSummary,
  type UploadConfig,
  type UploadTicket,
} from './reviews.api.js';

type RequestOptions = Omit<ApiRequestOptions, 'accessToken'>;
export type ViewerRequest = <T>(path: string, options?: RequestOptions) => Promise<T>;

/**
 * Da dang nhap: authenticatedRequest (401 thi lam moi token roi gui lai, vi duong dan cong khai van
 * kiem token neu co gui). Khach vang lai: gui khong token. Cho phien khoi phuc xong roi moi goi, de
 * khong tai danh sach hai lan (mot lan khach, mot lan nguoi dung).
 */
export function useViewerRequest() {
  const auth = useOptionalAuth();
  const user = auth?.user ?? null;
  const authenticated = auth?.authenticatedRequest;
  const request = useCallback<ViewerRequest>(
    (path, options = {}) =>
      user && authenticated ? authenticated(path, options) : apiRequest(path, options),
    [user, authenticated],
  );
  return { viewerId: user?.id ?? null, ready: !(auth?.isLoading ?? false), request };
}

export function useReviewSummary(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: reviewKeys.summary(slug),
    queryFn: ({ signal }) =>
      apiGet<ReviewSummary>(`/products/${encodeURIComponent(slug)}/reviews/summary`, undefined, {
        signal,
      }),
    enabled: enabled && Boolean(slug),
    retry: shouldRetryRequest,
  });
}

export function useProductReviews(slug: string, params: ReviewListParams, enabled: boolean) {
  const { viewerId, ready, request } = useViewerRequest();
  return useQuery({
    queryKey: reviewKeys.list(slug, viewerId ?? 'guest', params),
    queryFn: ({ signal }) => request<ReviewPage>(reviewListPath(slug, params), { signal }),
    enabled: enabled && ready && Boolean(slug),
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
}

/** Cap nhat ngay moi trang danh sach cua san pham dang co danh gia nay; khong tai lai ca trang. */
export function useHelpfulVote(slug: string) {
  const { request } = useViewerRequest();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, voted }: { id: string; voted: boolean }) =>
      request<HelpfulVote>(`/reviews/${id}/helpful`, { method: voted ? 'DELETE' : 'POST' }),
    onSuccess: (result, { id }) => {
      client.setQueriesData<ReviewPage>(
        { queryKey: [...reviewKeys.product(slug), 'list'] },
        (page) =>
          page && {
            ...page,
            items: page.items.map((item) =>
              item.id === id
                ? { ...item, helpfulCount: result.helpfulCount, viewerHasVoted: result.voted }
                : item,
            ),
          },
      );
    },
  });
}

export function useReportReview() {
  const { request } = useViewerRequest();
  return useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: ReportReason; note: string }) =>
      request<void>(`/reviews/${id}/report`, {
        method: 'POST',
        body: { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
  });
}

export function useEligibleReviews(enabled = true) {
  const { user, authenticatedRequest } = useAuth();
  return useQuery({
    queryKey: reviewKeys.eligible(user?.id ?? ''),
    queryFn: ({ signal }) =>
      authenticatedRequest<ReviewableItem[]>('/reviews/eligible', { signal }),
    enabled: enabled && Boolean(user),
    retry: shouldRetryRequest,
  });
}

export function useMyReviews(page: number, enabled = true) {
  const { user, authenticatedRequest } = useAuth();
  return useQuery({
    queryKey: reviewKeys.minePage(user?.id ?? '', page),
    queryFn: ({ signal }) =>
      authenticatedRequest<MyReviewPage>(`/reviews/mine?page=${page}&pageSize=10`, { signal }),
    enabled: enabled && Boolean(user),
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
}

export function useUploadConfig() {
  return useQuery({
    queryKey: reviewKeys.uploadConfig,
    queryFn: ({ signal }) => apiGet<UploadConfig>('/uploads/config', undefined, { signal }),
    staleTime: 5 * 60_000,
    retry: shouldRetryRequest,
  });
}

export type SaveReviewArgs =
  | { mode: 'create'; orderItemId: string; input: ReviewInput }
  | { mode: 'edit'; reviewId: string; input: Partial<ReviewInput> };

/** Luu xong: lam moi "cua toi" va moi cache cong khai cua san pham do (diem, danh sach). */
export function useSaveReview() {
  const { user, authenticatedRequest } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: SaveReviewArgs) =>
      args.mode === 'create'
        ? authenticatedRequest<MyReview>('/reviews', {
            method: 'POST',
            body: { orderItemId: args.orderItemId, ...args.input },
          })
        : authenticatedRequest<MyReview>(`/reviews/${args.reviewId}`, {
            method: 'PATCH',
            body: args.input,
          }),
    onSuccess: async (review) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: reviewKeys.mine(user?.id ?? '') }),
        client.invalidateQueries({ queryKey: reviewKeys.product(review.product.slug) }),
      ]);
    },
    // Gui lai sau loi mang ma lan dau da ghi: may chu bao trung. Tai lai de dong do roi danh sach cho.
    onError: async (error, args) => {
      if (args.mode === 'create' && requestErrorCode(error) === 'REVIEW_ALREADY_EXISTS') {
        await client.invalidateQueries({ queryKey: reviewKeys.mine(user?.id ?? '') });
      }
    },
  });
}

/**
 * Xoa danh gia cua minh. Da xoa o tab khac hay lan bam truoc (404) thi voi khach la xong roi: coi
 * nhu thanh cong va tai lai danh sach. Xong thi lam moi "cua toi" (gom danh sach cho) va cache cong
 * khai cua san pham do.
 */
export function useDeleteReview() {
  const { user, authenticatedRequest } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (review: Pick<MyReview, 'id' | 'product'>) => {
      try {
        await authenticatedRequest<void>(`/reviews/${review.id}`, { method: 'DELETE' });
      } catch (error) {
        if (requestErrorCode(error) !== 'REVIEW_NOT_FOUND') throw error;
      }
    },
    onSuccess: async (_result, review) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: reviewKeys.mine(user?.id ?? '') }),
        client.invalidateQueries({ queryKey: reviewKeys.product(review.product.slug) }),
      ]);
    },
  });
}

export const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Kiem truoc o trinh duyet cho nhanh; may chu van kiem lai anh that tren kho. */
export function photoProblem(file: File, config: UploadConfig): string | null {
  const format = PHOTO_TYPES[file.type];
  if (!format || !config.formats.includes(format)) return 'Chỉ nhận ảnh JPG, PNG hoặc WebP.';
  if (file.size > config.maxBytes) {
    return `Ảnh quá ${Math.round(config.maxBytes / 1024 / 1024)} MB.`;
  }
  return null;
}

/** Mot phieu mot anh: xin phieu tu may chu, tai thang len kho, tra khoa de gui kem danh gia. */
export function useUploadPhoto() {
  const { authenticatedRequest } = useAuth();
  return useCallback(
    async (file: File, signal?: AbortSignal): Promise<string> => {
      const ticket = await authenticatedRequest<UploadTicket>('/uploads/tickets', {
        method: 'POST',
        body: { purpose: 'review' },
        signal,
      });
      const form = new FormData();
      for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
      form.append('file', file);
      await postExternalForm<unknown>(ticket.uploadUrl, form, signal);
      return ticket.key;
    },
    [authenticatedRequest],
  );
}
