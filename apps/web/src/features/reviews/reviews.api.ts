import { type Page, sessionQueryKeys } from '@/core';

/** Hinh dang khop apps/api/src/modules/reviews/dto/review.response.ts (Swagger /api/docs). */
export type FitFeedback = 'TOO_SMALL' | 'TRUE_TO_SIZE' | 'TOO_LARGE';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewSort = 'helpful' | 'newest' | 'rating_desc' | 'rating_asc';
export type ReportReason = 'SPAM' | 'OFFENSIVE' | 'IRRELEVANT' | 'PRIVACY' | 'OTHER';

export interface ReviewMedia {
  /** Ban lon cho lightbox. */
  url: string;
  /** Ban vuong 160 px cho luoi anh: o 72 px khong tai ban 1600 px. */
  thumbnailUrl: string;
}
export interface ReviewReply {
  content: string;
  repliedAt: string;
}
export interface Review {
  id: string;
  rating: number;
  content: string | null;
  fitFeedback: FitFeedback | null;
  variantLabel: string | null;
  heightCm: number | null;
  weightKg: number | null;
  reviewerName: string;
  media: ReviewMedia[];
  helpfulCount: number;
  viewerHasVoted: boolean;
  isOwn: boolean;
  reply: ReviewReply | null;
  createdAt: string;
  editedAt: string | null;
}
export interface ReviewSummary {
  average: number;
  count: number;
  distribution: { rating: number; count: number }[];
  withMediaCount: number;
  withContentCount: number;
  fit: { tooSmall: number; trueToSize: number; tooLarge: number; total: number };
}
export interface ReviewProduct {
  name: string;
  slug: string;
  imageUrl: string | null;
}
export interface ReviewableItem {
  orderItemId: string;
  orderId: string;
  orderCode: string;
  product: ReviewProduct;
  variantLabel: string | null;
  deliveredAt: string;
  reviewDeadline: string;
}
export interface MyReview {
  id: string;
  orderItemId: string;
  orderId: string | null;
  product: ReviewProduct;
  variantLabel: string | null;
  rating: number;
  content: string | null;
  fitFeedback: FitFeedback | null;
  heightCm: number | null;
  weightKg: number | null;
  isAnonymous: boolean;
  reviewerName: string;
  /** key null: anh nap tay, khong gui lai duoc khi sua. */
  media: (ReviewMedia & { key: string | null })[];
  status: ReviewStatus;
  moderationNote: string | null;
  reply: ReviewReply | null;
  helpfulCount: number;
  canEdit: boolean;
  editDeadline: string;
  createdAt: string;
  editedAt: string | null;
}
export interface AdminReview {
  id: string;
  reviewer: { id: string; email: string; displayName: string };
  product: ReviewProduct;
  orderCode: string | null;
  variantLabel: string | null;
  rating: number;
  content: string | null;
  fitFeedback: FitFeedback | null;
  heightCm: number | null;
  weightKg: number | null;
  isAnonymous: boolean;
  media: ReviewMedia[];
  status: ReviewStatus;
  moderationNote: string | null;
  moderatedAt: string | null;
  helpfulCount: number;
  reportCount: number;
  /** Phien ban luc tai; gui kem lenh duyet/an de may chu tu choi neu khach vua sua. */
  editCount: number;
  reports: { reason: ReportReason; note: string | null; createdAt: string }[];
  reply: ReviewReply | null;
  createdAt: string;
  editedAt: string | null;
}
export interface HelpfulVote {
  helpfulCount: number;
  voted: boolean;
}
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  formats: string[];
}
export interface UploadTicket {
  uploadUrl: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
  maxBytes: number;
  formats: string[];
}

/** Than POST /reviews va PATCH /reviews/:id. `null` xoa truong tuy chon khi sua. */
export interface ReviewInput {
  rating: number;
  content: string | null;
  fitFeedback: FitFeedback | null;
  heightCm: number | null;
  weightKg: number | null;
  isAnonymous: boolean;
  media: { key: string }[];
}

export interface ReviewListParams {
  page: number;
  pageSize: number;
  sort: ReviewSort;
  rating?: number;
  withMedia?: boolean;
  withContent?: boolean;
}

export interface AdminReviewFilters {
  page: number;
  status: ReviewStatus | 'ALL';
  reported: boolean;
  q: string;
}

export type ReviewPage = Page<Review>;
export type MyReviewPage = Page<MyReview>;
export type AdminReviewPage = Page<AdminReview>;

/**
 * Tong hop sao la du lieu cong khai: khoa chung moi nguoi. Danh sach co viewerHasVoted/isOwn nen
 * khoa theo nguoi xem. Du lieu cua chinh khach nam duoi goc `session` de dang xuat la xoa.
 */
export const reviewKeys = {
  product: (slug: string) => ['reviews', slug] as const,
  summary: (slug: string) => [...reviewKeys.product(slug), 'summary'] as const,
  list: (slug: string, viewer: string, params: ReviewListParams) =>
    [...reviewKeys.product(slug), 'list', viewer, params] as const,
  uploadConfig: ['uploads', 'config'] as const,
  mine: (userId: string) => [...sessionQueryKeys.scope('reviews'), userId] as const,
  eligible: (userId: string) => [...reviewKeys.mine(userId), 'eligible'] as const,
  minePage: (userId: string, page: number) => [...reviewKeys.mine(userId), 'page', page] as const,
  admin: (actor: string) => [...sessionQueryKeys.adminResource('reviews'), actor] as const,
  adminList: (actor: string, filters: AdminReviewFilters) =>
    [...reviewKeys.admin(actor), 'list', filters] as const,
};

export const FIT_LABELS: Record<FitFeedback, string> = {
  TOO_SMALL: 'Chật',
  TRUE_TO_SIZE: 'Vừa vặn',
  TOO_LARGE: 'Rộng',
};
export const RATING_LABELS = ['', 'Tệ', 'Không hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];
export const REPORT_LABELS: Record<ReportReason, string> = {
  SPAM: 'Quảng cáo, spam',
  OFFENSIVE: 'Ngôn từ thô tục, xúc phạm',
  IRRELEVANT: 'Không liên quan sản phẩm',
  PRIVACY: 'Lộ thông tin cá nhân',
  OTHER: 'Lý do khác',
};
export const STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đang hiển thị',
  REJECTED: 'Đã ẩn',
};
export const REVIEW_CONTENT_MAX = 1500;
export const REVIEW_MEDIA_MAX = 5;

/** Chuoi truy van cho danh sach cong khai; bo truong rong de URL gon va khop khoa cache. */
export function reviewListPath(slug: string, params: ReviewListParams): string {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    sort: params.sort,
  });
  if (params.rating) query.set('rating', String(params.rating));
  if (params.withMedia !== undefined) query.set('withMedia', String(params.withMedia));
  if (params.withContent !== undefined) query.set('withContent', String(params.withContent));
  return `/products/${encodeURIComponent(slug)}/reviews?${query.toString()}`;
}

export function adminReviewPath(filters: AdminReviewFilters): string {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
  if (filters.status !== 'ALL') query.set('status', filters.status);
  if (filters.reported) query.set('reported', 'true');
  if (filters.q.trim()) query.set('q', filters.q.trim());
  return `/admin/reviews?${query.toString()}`;
}

export function formatReviewDate(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(iso));
}
