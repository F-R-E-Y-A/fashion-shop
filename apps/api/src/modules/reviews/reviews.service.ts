import { Injectable } from '@nestjs/common';

import type { PageQuery } from '../../common/pagination/page.query.js';
import { type Page, skipOf, toPage } from '../../common/pagination/page.response.js';
import type { FitFeedback, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersService, type PurchasedItem } from '../orders/index.js';
import { ProductsService } from '../products/index.js';
import { UploadsService } from '../uploads/index.js';
import type {
  HelpfulVoteResponse,
  MyReviewResponse,
  ReviewableItemResponse,
  ReviewResponse,
  ReviewSummaryResponse,
} from './dto/review.response.js';
import type {
  CreateReviewRequest,
  ReportReviewRequest,
  UpdateReviewRequest,
} from './dto/review-input.dto.js';
import type { ListProductReviewsQuery, ProductReviewSort } from './dto/review-query.dto.js';
import {
  duplicateMedia,
  isUniqueViolation,
  mediaInUse,
  orderItemNotFound,
  ownReview,
  reviewAlreadyExists,
  reviewNotAllowed,
  reviewNotEditable,
  reviewNotFound,
  reviewWindowClosed,
} from './review-errors.js';
import {
  canEditReview,
  moderationFor,
  normalizeContent,
  ratingSummary,
  REVIEWABLE_ORDER_STATUSES,
  reviewDeadline,
  reviewWindowStart,
} from './review-policy.js';
import { ReviewRatingService } from './review-ratings.service.js';
import {
  type MyReviewRow,
  myReviewSelect,
  publicReviewSelect,
  toMyReview,
  toReviewResponse,
} from './review-rows.js';

/** Moi sap xep deu chot bang createdAt roi id de phan trang khong lap hay sot dong. */
const PUBLIC_ORDER: Record<ProductReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  helpful: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  rating_desc: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  rating_asc: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
};

/** Ten bien the trong ban chup co the dai hon cot VARCHAR(120). */
const VARIANT_LABEL_MAX = 120;

/** Chi danh gia da duyet, chua xoa mem moi hien voi nguoi xem. */
function visibleOn(productId: string): Prisma.ReviewWhereInput {
  return { productId, moderationStatus: 'APPROVED', deletedAt: null };
}

function assertReviewable(item: PurchasedItem, now: Date): void {
  const reviewable = (REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(item.orderStatus);
  if (!reviewable || item.deliveredAt === null) throw reviewNotAllowed();
  if (now.getTime() > reviewDeadline(item.deliveredAt).getTime()) throw reviewWindowClosed();
}

/**
 * Danh gia san pham phia khach (ADR-054): xem cong khai, viet cho dong don da giao, sua mot lan,
 * bam huu ich, bao cao. Quyen viet suy ra tu dong don cua chinh nguoi goi, khong tin productId gui len.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly uploads: UploadsService,
    private readonly ratings: ReviewRatingService,
  ) {}

  /** Phan bo tinh tu cung tap dang hien, nen tong cac muc luon bang `count`. */
  async summary(slug: string): Promise<ReviewSummaryResponse> {
    const visible = visibleOn(await this.products.storefrontProductId(slug));
    const [byRating, withMediaCount, withContentCount, byFit] = await Promise.all([
      this.prisma.review.groupBy({ by: ['rating'], where: visible, _count: { _all: true } }),
      this.prisma.review.count({ where: { ...visible, media: { some: {} } } }),
      this.prisma.review.count({ where: { ...visible, content: { not: null } } }),
      this.prisma.review.groupBy({
        by: ['fitFeedback'],
        where: { ...visible, fitFeedback: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const tallies = byRating.map((row) => ({ rating: row.rating, count: row._count._all }));
    const fitOf = (code: FitFeedback): number =>
      byFit.find((row) => row.fitFeedback === code)?._count._all ?? 0;
    const fit = {
      tooSmall: fitOf('TOO_SMALL'),
      trueToSize: fitOf('TRUE_TO_SIZE'),
      tooLarge: fitOf('TOO_LARGE'),
    };
    return {
      ...ratingSummary(tallies),
      distribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: tallies.find((row) => row.rating === rating)?.count ?? 0,
      })),
      withMediaCount,
      withContentCount,
      fit: { ...fit, total: fit.tooSmall + fit.trueToSize + fit.tooLarge },
    };
  }

  async listForProduct(
    slug: string,
    query: ListProductReviewsQuery,
    viewerId: string | null,
  ): Promise<Page<ReviewResponse>> {
    const productId = await this.products.storefrontProductId(slug);
    const where: Prisma.ReviewWhereInput = {
      ...visibleOn(productId),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.withMedia === undefined
        ? {}
        : { media: query.withMedia ? { some: {} } : { none: {} } }),
      ...(query.withContent === undefined
        ? {}
        : { content: query.withContent ? { not: null } : null }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: publicReviewSelect,
        orderBy: PUBLIC_ORDER[query.sort ?? 'helpful'],
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    const voted = viewerId
      ? await this.votedIds(
          viewerId,
          rows.map((row) => row.id),
        )
      : new Set<string>();
    return toPage(
      rows.map((row) => toReviewResponse(row, viewerId, voted)),
      total,
      query,
    );
  }

  /**
   * Dong don cho danh gia. DELIVERED chi xay ra mot lan moi don (ORDER_TRANSITIONS khong quay lai
   * SHIPPED), nen danh gia cua dong giao tu `since` chac chan tao sau `since`: loai bang cua so do.
   */
  async reviewable(userId: string, now: Date = new Date()): Promise<ReviewableItemResponse[]> {
    const since = reviewWindowStart(now);
    const reviewed = await this.prisma.review.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { orderItemId: true },
    });
    const items = await this.orders.deliveredItems(
      userId,
      REVIEWABLE_ORDER_STATUSES,
      since,
      reviewed.map((row) => row.orderItemId),
    );
    return items.flatMap((item) => {
      if (item.deliveredAt === null) return [];
      const deadline = reviewDeadline(item.deliveredAt);
      if (deadline.getTime() < now.getTime()) return [];
      return [
        {
          orderItemId: item.orderItemId,
          orderId: item.orderId,
          orderCode: item.orderCode,
          product: {
            name: item.snapshot.name,
            slug: item.snapshot.productSlug,
            imageUrl: item.snapshot.imageUrl,
          },
          variantLabel: item.snapshot.variantLabel,
          deliveredAt: item.deliveredAt.toISOString(),
          reviewDeadline: deadline.toISOString(),
        },
      ];
    });
  }

  async mine(
    userId: string,
    query: PageQuery,
    now: Date = new Date(),
  ): Promise<Page<MyReviewResponse>> {
    const where: Prisma.ReviewWhereInput = { userId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: myReviewSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    const items = await this.orders.purchasedItems(rows.map((row) => row.orderItemId));
    return toPage(
      rows.map((row) => toMyReview(row, items.get(row.orderItemId), now)),
      total,
      query,
    );
  }

  async create(
    userId: string,
    input: CreateReviewRequest,
    now: Date = new Date(),
  ): Promise<MyReviewResponse> {
    const item = await this.orders.purchasedItem(input.orderItemId, userId);
    if (!item) throw orderItemNotFound();
    assertReviewable(item, now);
    const existing = await this.prisma.review.findUnique({
      where: { orderItemId: item.orderItemId },
      select: { id: true },
    });
    if (existing) throw reviewAlreadyExists();

    const content = normalizeContent(input.content);
    const keys = (input.media ?? []).map((media) => media.key);
    await this.assertMediaUnused(keys);
    const media = await this.uploads.resolveReviewMedia(userId, keys);
    const status = moderationFor({ content, mediaCount: media.length });

    let row: MyReviewRow;
    try {
      row = await this.prisma.$transaction(async (transaction) => {
        // Lay phieu cho cua tung anh cung giao dich: tao danh gia loi thi anh van cho, worker don sau.
        await this.uploads.attach(userId, keys, transaction);
        const created = await transaction.review.create({
          data: {
            userId,
            productId: item.productId,
            orderItemId: item.orderItemId,
            rating: input.rating,
            content,
            fitFeedback: input.fitFeedback ?? null,
            heightCm: input.heightCm ?? null,
            weightKg: input.weightKg ?? null,
            isAnonymous: input.isAnonymous ?? false,
            variantLabel: item.snapshot.variantLabel?.slice(0, VARIANT_LABEL_MAX) ?? null,
            moderationStatus: status,
            media: {
              create: media.map((image, index) => ({
                url: image.url,
                thumbnailUrl: image.thumbnailUrl,
                storageKey: image.key,
                sortOrder: index,
              })),
            },
          },
          select: myReviewSelect,
        });
        if (status === 'APPROVED') await this.ratings.recompute(item.productId, transaction);
        return created;
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Hai cot UNIQUE: order_item_id (gui hai lan cung luc) hoac storage_key (anh vua gan noi khac).
      const raced = await this.prisma.review.findUnique({
        where: { orderItemId: item.orderItemId },
        select: { id: true },
      });
      throw raced ? reviewAlreadyExists() : mediaInUse();
    }
    return toMyReview(row, item, now);
  }

  /**
   * Sua mot lan trong han, duyet lai theo cung luat luc viet. Khoa lac quan bang editCount: hai lan
   * sua dong thoi thi lan sau nhan 422 thay vi vuot gioi han sua.
   */
  async update(
    userId: string,
    reviewId: string,
    input: UpdateReviewRequest,
    now: Date = new Date(),
  ): Promise<MyReviewResponse> {
    const current = await this.prisma.review.findFirst({
      where: { id: reviewId, userId, deletedAt: null },
      select: myReviewSelect,
    });
    if (!current) throw reviewNotFound();
    if (!canEditReview(current, now)) throw reviewNotEditable();

    const content = input.content === undefined ? current.content : normalizeContent(input.content);
    const plan =
      input.media === undefined
        ? null
        : await this.planMedia(
            userId,
            current,
            input.media.map((media) => media.key),
          );
    const status = moderationFor({
      content,
      mediaCount: plan ? plan.images.length : current.media.length,
    });

    let row: MyReviewRow;
    try {
      row = await this.prisma.$transaction(async (transaction) => {
        const claimed = await transaction.review.updateMany({
          where: {
            id: reviewId,
            editCount: current.editCount,
            moderationStatus: { not: 'REJECTED' },
            deletedAt: null,
          },
          data: {
            rating: input.rating,
            content,
            fitFeedback: input.fitFeedback,
            heightCm: input.heightCm,
            weightKg: input.weightKg,
            isAnonymous: input.isAnonymous,
            moderationStatus: status,
            moderationNote: null,
            moderatedAt: null,
            moderatedById: null,
            editCount: { increment: 1 },
            editedAt: now,
          },
        });
        if (claimed.count === 0) throw reviewNotEditable();
        if (plan) {
          // Anh moi lay phieu cho; anh bi go vao hang xoa. Cung giao dich: rollback thi khong anh nao
          // bi xoa nham, va worker xoa tren kho theo lo thay vi mot lenh moi lan sua.
          await this.uploads.attach(userId, plan.freshKeys, transaction);
          await this.uploads.release(userId, plan.removedKeys, transaction);
          await transaction.reviewMedia.deleteMany({ where: { reviewId } });
          if (plan.images.length > 0) {
            await transaction.reviewMedia.createMany({
              data: plan.images.map((image, index) => ({
                reviewId,
                url: image.url,
                thumbnailUrl: image.thumbnailUrl,
                storageKey: image.key,
                sortOrder: index,
              })),
            });
          }
        }
        if (current.moderationStatus === 'APPROVED' || status === 'APPROVED') {
          await this.ratings.recompute(current.productId, transaction);
        }
        return transaction.review.findUniqueOrThrow({
          where: { id: reviewId },
          select: myReviewSelect,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw mediaInUse();
      throw error;
    }
    const item = await this.orders.purchasedItem(row.orderItemId, userId);
    return toMyReview(row, item ?? undefined, now);
  }

  /**
   * Khach xoa danh gia cua minh luc nao cung duoc, ke ca bai cho duyet hay da bi an (ADR-059). Xoa
   * mem de giu cho dong don: viet lai thi 409, nen khong lach duoc luat sua mot lan hay kiem duyet.
   * Anh vao hang xoa; bai dang hien thi diem san pham tinh lai trong cung giao dich.
   */
  async remove(userId: string, reviewId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      // Khoa dong reviews truoc dong products (thu tu cua ADR-054): quan tri dang duyet hay an cung
      // bai thi mot ben doi ben kia, va trang thai doc duoi khoa la trang thai cuoi cung.
      const locked = await transaction.$queryRaw<{ id: string }[]>`
        SELECT id FROM public.reviews
        WHERE id = ${reviewId}::uuid AND user_id = ${userId}::uuid AND deleted_at IS NULL
        FOR UPDATE`;
      if (locked.length === 0) throw reviewNotFound();
      const removed = await transaction.review.update({
        where: { id: reviewId },
        data: { deletedAt: new Date() },
        select: {
          productId: true,
          moderationStatus: true,
          media: { select: { storageKey: true } },
        },
      });
      const keys = removed.media.flatMap((media) => (media.storageKey ? [media.storageKey] : []));
      await this.uploads.release(userId, keys, transaction);
      await transaction.reviewMedia.deleteMany({ where: { reviewId } });
      if (removed.moderationStatus === 'APPROVED') {
        await this.ratings.recompute(removed.productId, transaction);
      }
    });
  }

  /** Bam lai khong cong them: INSERT ... ON CONFLICT DO NOTHING roi chi tang dem khi chen duoc. */
  async vote(userId: string, reviewId: string): Promise<HelpfulVoteResponse> {
    return this.prisma.$transaction(async (transaction) => {
      const review = await transaction.review.findFirst({
        where: { id: reviewId, moderationStatus: 'APPROVED', deletedAt: null },
        select: { userId: true, helpfulCount: true },
      });
      if (!review) throw reviewNotFound();
      if (review.userId === userId) throw ownReview();
      const inserted = await transaction.reviewHelpfulVote.createMany({
        data: [{ reviewId, userId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return { helpfulCount: review.helpfulCount, voted: true };
      const updated = await transaction.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { increment: 1 } },
        select: { helpfulCount: true },
      });
      return { helpfulCount: updated.helpfulCount, voted: true };
    });
  }

  /** Bo phieu duoc ca khi danh gia da bi an, de dem khong lech so phieu con lai. */
  async unvote(userId: string, reviewId: string): Promise<HelpfulVoteResponse> {
    return this.prisma.$transaction(async (transaction) => {
      const review = await transaction.review.findFirst({
        where: { id: reviewId, deletedAt: null },
        select: { helpfulCount: true },
      });
      if (!review) throw reviewNotFound();
      const removed = await transaction.reviewHelpfulVote.deleteMany({
        where: { reviewId, userId },
      });
      if (removed.count === 0) return { helpfulCount: review.helpfulCount, voted: false };
      const updated = await transaction.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { decrement: removed.count } },
        select: { helpfulCount: true },
      });
      return { helpfulCount: updated.helpfulCount, voted: false };
    });
  }

  /** Bao cao chi danh dau cho quan tri xem; khong tu an. Bao cao lai la khong doi gi (204). */
  async report(userId: string, reviewId: string, input: ReportReviewRequest): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const review = await transaction.review.findFirst({
        where: { id: reviewId, moderationStatus: 'APPROVED', deletedAt: null },
        select: { userId: true },
      });
      if (!review) throw reviewNotFound();
      if (review.userId === userId) throw ownReview();
      const inserted = await transaction.reviewReport.createMany({
        data: [{ reviewId, userId, reason: input.reason, note: input.note || null }],
        skipDuplicates: true,
      });
      if (inserted.count > 0) {
        await transaction.review.update({
          where: { id: reviewId },
          data: { reportCount: { increment: 1 } },
        });
      }
    });
  }

  private async votedIds(userId: string, reviewIds: string[]): Promise<Set<string>> {
    if (reviewIds.length === 0) return new Set();
    const votes = await this.prisma.reviewHelpfulVote.findMany({
      where: { userId, reviewId: { in: reviewIds } },
      select: { reviewId: true },
    });
    return new Set(votes.map((vote) => vote.reviewId));
  }

  /** Bao som anh da gan noi khac; UNIQUE storage_key van chan truong hop dua nhau. */
  private async assertMediaUnused(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    const used = await this.prisma.reviewMedia.findFirst({
      where: { storageKey: { in: [...keys] } },
      select: { id: true },
    });
    if (used) throw mediaInUse();
  }

  /** Anh da gan danh gia nay giu nguyen URL; anh moi phai qua kiem cua UploadsService. */
  private async planMedia(
    userId: string,
    current: MyReviewRow,
    keys: string[],
  ): Promise<{
    images: { key: string; url: string; thumbnailUrl: string | null }[];
    freshKeys: string[];
    removedKeys: string[];
  }> {
    if (new Set(keys).size !== keys.length) throw duplicateMedia();
    const attached = new Map<string, { url: string; thumbnailUrl: string | null }>();
    for (const media of current.media) {
      if (media.storageKey) {
        attached.set(media.storageKey, { url: media.url, thumbnailUrl: media.thumbnailUrl });
      }
    }
    const freshKeys = keys.filter((key) => !attached.has(key));
    await this.assertMediaUnused(freshKeys);
    const resolved = await this.uploads.resolveReviewMedia(userId, freshKeys);
    const urlsOf = new Map([...attached, ...resolved.map((image) => [image.key, image] as const)]);
    return {
      // resolveReviewMedia tra du moi khoa moi hoac nem loi, nen khong khoa nao bi rot o day.
      images: keys.flatMap((key) => {
        const urls = urlsOf.get(key);
        return urls ? [{ key, url: urls.url, thumbnailUrl: urls.thumbnailUrl }] : [];
      }),
      freshKeys,
      removedKeys: [...attached.keys()].filter((key) => !keys.includes(key)),
    };
  }
}
