import type { Prisma } from '../../generated/prisma/client.js';
import type { PurchasedItem } from '../orders/index.js';
import type {
  AdminReviewResponse,
  MyReviewResponse,
  ReviewProductResponse,
  ReviewReplyResponse,
  ReviewResponse,
} from './dto/review.response.js';
import { canEditReview, editDeadline, reviewerDisplayName } from './review-policy.js';

/** Cot can cho trang cong khai. Email chi dung de dung ten hien, khong bao gio ra phan hoi. */
export const publicReviewSelect = {
  id: true,
  userId: true,
  rating: true,
  content: true,
  fitFeedback: true,
  variantLabel: true,
  heightCm: true,
  weightKg: true,
  isAnonymous: true,
  helpfulCount: true,
  replyContent: true,
  repliedAt: true,
  createdAt: true,
  editedAt: true,
  reviewer: { select: { fullName: true, email: true } },
  media: { orderBy: { sortOrder: 'asc' as const }, select: { url: true, thumbnailUrl: true } },
} satisfies Prisma.ReviewSelect;

export type PublicReviewRow = Prisma.ReviewGetPayload<{ select: typeof publicReviewSelect }>;

/** Them trang thai duyet, so lan sua va khoa anh (de giu anh cu khi sua). */
export const myReviewSelect = {
  ...publicReviewSelect,
  orderItemId: true,
  productId: true,
  moderationStatus: true,
  moderationNote: true,
  editCount: true,
  product: { select: { name: true, slug: true } },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: { url: true, thumbnailUrl: true, storageKey: true },
  },
} satisfies Prisma.ReviewSelect;

export type MyReviewRow = Prisma.ReviewGetPayload<{ select: typeof myReviewSelect }>;

export const adminReviewSelect = {
  ...myReviewSelect,
  reportCount: true,
  moderatedAt: true,
  reviewer: { select: { id: true, fullName: true, email: true } },
  reports: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'asc' as const }],
    take: 5,
    select: { reason: true, note: true, createdAt: true },
  },
} satisfies Prisma.ReviewSelect;

export type AdminReviewRow = Prisma.ReviewGetPayload<{ select: typeof adminReviewSelect }>;

function replyOf(row: {
  replyContent: string | null;
  repliedAt: Date | null;
}): ReviewReplyResponse | null {
  if (row.replyContent === null || row.repliedAt === null) return null;
  return { content: row.replyContent, repliedAt: row.repliedAt.toISOString() };
}

/** Ten va anh lay tu ban chup luc mua (dung thu khach nhan); slug lay hien tai de link khong gay. */
function productOf(
  row: { product: { name: string; slug: string } },
  item: PurchasedItem | undefined,
): ReviewProductResponse {
  return {
    name: item?.snapshot.name ?? row.product.name,
    slug: row.product.slug,
    imageUrl: item?.snapshot.imageUrl ?? null,
  };
}

function displayName(row: {
  isAnonymous: boolean;
  reviewer: { fullName: string | null; email: string };
}): string {
  return reviewerDisplayName({
    fullName: row.reviewer.fullName,
    email: row.reviewer.email,
    isAnonymous: row.isAnonymous,
  });
}

export function toReviewResponse(
  row: PublicReviewRow,
  viewerId: string | null,
  votedIds: ReadonlySet<string>,
): ReviewResponse {
  return {
    id: row.id,
    rating: row.rating,
    content: row.content,
    fitFeedback: row.fitFeedback,
    variantLabel: row.variantLabel,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    reviewerName: displayName(row),
    media: row.media.map((media) => ({
      url: media.url,
      thumbnailUrl: media.thumbnailUrl ?? media.url,
    })),
    helpfulCount: row.helpfulCount,
    viewerHasVoted: votedIds.has(row.id),
    isOwn: viewerId !== null && viewerId === row.userId,
    reply: replyOf(row),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

export function toMyReview(
  row: MyReviewRow,
  item: PurchasedItem | undefined,
  now: Date,
): MyReviewResponse {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    orderId: item?.orderId ?? null,
    product: productOf(row, item),
    variantLabel: row.variantLabel,
    rating: row.rating,
    content: row.content,
    fitFeedback: row.fitFeedback,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    isAnonymous: row.isAnonymous,
    reviewerName: displayName(row),
    media: row.media.map((media) => ({
      url: media.url,
      thumbnailUrl: media.thumbnailUrl ?? media.url,
      key: media.storageKey,
    })),
    status: row.moderationStatus,
    moderationNote: row.moderationStatus === 'REJECTED' ? row.moderationNote : null,
    reply: replyOf(row),
    helpfulCount: row.helpfulCount,
    canEdit: canEditReview(row, now),
    editDeadline: editDeadline(row.createdAt).toISOString(),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

export function toAdminReview(
  row: AdminReviewRow,
  item: PurchasedItem | undefined,
): AdminReviewResponse {
  return {
    id: row.id,
    reviewer: { id: row.reviewer.id, email: row.reviewer.email, displayName: displayName(row) },
    product: productOf(row, item),
    orderCode: item?.orderCode ?? null,
    variantLabel: row.variantLabel,
    rating: row.rating,
    content: row.content,
    fitFeedback: row.fitFeedback,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    isAnonymous: row.isAnonymous,
    media: row.media.map((media) => ({
      url: media.url,
      thumbnailUrl: media.thumbnailUrl ?? media.url,
    })),
    status: row.moderationStatus,
    moderationNote: row.moderationNote,
    moderatedAt: row.moderatedAt?.toISOString() ?? null,
    helpfulCount: row.helpfulCount,
    reportCount: row.reportCount,
    editCount: row.editCount,
    reports: row.reports.map((report) => ({
      reason: report.reason,
      note: report.note,
      createdAt: report.createdAt.toISOString(),
    })),
    reply: replyOf(row),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}
