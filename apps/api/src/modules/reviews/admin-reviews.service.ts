import { ConflictException, Injectable } from '@nestjs/common';

import { type Page, skipOf, toPage } from '../../common/pagination/page.response.js';
import type { Prisma, ReviewStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersService } from '../orders/index.js';
import type { AdminReviewResponse } from './dto/review.response.js';
import type { ListAdminReviewsQuery } from './dto/review-query.dto.js';
import { AUDIT_ENTITY_REVIEW, ReviewAuditAction } from './review-audit.js';
import { reviewChanged, reviewNotFound } from './review-errors.js';
import { ReviewRatingService } from './review-ratings.service.js';
import { adminReviewSelect, toAdminReview } from './review-rows.js';

interface LockedReview {
  moderationStatus: ReviewStatus;
  productId: string;
  replyContent: string | null;
  reportCount: number;
  editCount: number;
}

/**
 * Kiem duyet danh gia (ADR-054). Moi thao tac khoa dong danh gia (FOR UPDATE) truoc, roi moi khoa
 * dong san pham khi tinh diem: cung thu tu voi luong sua cua khach nen khong khoa cheo. Moi lan doi
 * deu ghi audit_logs; metadata chi co trang thai, khong chep noi dung hay email.
 */
@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly ratings: ReviewRatingService,
  ) {}

  async list(query: ListAdminReviewsQuery): Promise<Page<AdminReviewResponse>> {
    // contains dung LIKE: escape wildcard, Prisma van tham so hoa gia tri.
    const pattern = query.q?.replace(/[\\%_]/g, (char) => `\\${char}`);
    const where: Prisma.ReviewWhereInput = {
      deletedAt: null,
      ...(query.status ? { moderationStatus: query.status } : {}),
      ...(query.reported === undefined ? {} : { reportCount: query.reported ? { gt: 0 } : 0 }),
      ...(query.rating ? { rating: query.rating } : {}),
      ...(pattern
        ? {
            OR: [
              { content: { contains: pattern, mode: 'insensitive' } },
              { reviewer: { email: { contains: pattern, mode: 'insensitive' } } },
              { product: { name: { contains: pattern, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    // Hang cho duyet: cu nhat truoc de khong ai bi bo quen. Bi bao cao: nhieu bao cao truoc.
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] = query.reported
      ? [{ reportCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }]
      : query.status === 'PENDING'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: adminReviewSelect,
        orderBy,
        skip: skipOf(query),
        take: query.pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    const items = await this.orders.purchasedItems(rows.map((row) => row.orderItemId));
    return toPage(
      rows.map((row) => toAdminReview(row, items.get(row.orderItemId))),
      total,
      query,
    );
  }

  /**
   * Duyet dung ban quan tri da doc (editCount khop), khong thi 409. Duyet lai danh gia da duyet thi
   * khong doi gi va khong ghi nhat ky.
   */
  async approve(
    actorId: string,
    reviewId: string,
    editCount: number,
  ): Promise<AdminReviewResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.lock(transaction, reviewId, editCount);
      if (current.moderationStatus === 'APPROVED') return;
      await transaction.review.update({
        where: { id: reviewId },
        data: {
          moderationStatus: 'APPROVED',
          moderationNote: null,
          moderatedAt: new Date(),
          moderatedById: actorId,
        },
      });
      await this.ratings.recompute(current.productId, transaction);
      await this.audit(transaction, actorId, ReviewAuditAction.APPROVE, reviewId, {
        fromStatus: current.moderationStatus,
        toStatus: 'APPROVED',
      });
    });
    return this.detail(reviewId);
  }

  /** An danh gia kem ly do; nguoi viet thay ly do o trang cua minh va khong sua duoc nua. */
  async reject(
    actorId: string,
    reviewId: string,
    note: string,
    editCount: number,
  ): Promise<AdminReviewResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.lock(transaction, reviewId, editCount);
      if (current.moderationStatus === 'REJECTED') {
        throw new ConflictException({
          error: 'REVIEW_ALREADY_REJECTED',
          message: 'Đánh giá này đã bị ẩn.',
        });
      }
      await transaction.review.update({
        where: { id: reviewId },
        data: {
          moderationStatus: 'REJECTED',
          moderationNote: note,
          moderatedAt: new Date(),
          moderatedById: actorId,
        },
      });
      if (current.moderationStatus === 'APPROVED') {
        await this.ratings.recompute(current.productId, transaction);
      }
      await this.audit(transaction, actorId, ReviewAuditAction.REJECT, reviewId, {
        fromStatus: current.moderationStatus,
        toStatus: 'REJECTED',
      });
    });
    return this.detail(reviewId);
  }

  /** Mot danh gia mot phan hoi cua shop; gui lai la sua phan hoi. */
  async reply(actorId: string, reviewId: string, content: string): Promise<AdminReviewResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.lock(transaction, reviewId);
      await transaction.review.update({
        where: { id: reviewId },
        data: { replyContent: content, repliedAt: new Date(), repliedById: actorId },
      });
      await this.audit(transaction, actorId, ReviewAuditAction.REPLY, reviewId, {
        edited: current.replyContent !== null,
      });
    });
    return this.detail(reviewId);
  }

  async removeReply(actorId: string, reviewId: string): Promise<AdminReviewResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.lock(transaction, reviewId);
      if (current.replyContent === null) return;
      await transaction.review.update({
        where: { id: reviewId },
        data: { replyContent: null, repliedAt: null, repliedById: null },
      });
      await this.audit(transaction, actorId, ReviewAuditAction.REMOVE_REPLY, reviewId, {});
    });
    return this.detail(reviewId);
  }

  /** Bao cao sai (danh gia khong vi pham): xoa het bao cao, dem ve 0. */
  async clearReports(actorId: string, reviewId: string): Promise<AdminReviewResponse> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await this.lock(transaction, reviewId);
      const removed = await transaction.reviewReport.deleteMany({ where: { reviewId } });
      if (removed.count === 0 && current.reportCount === 0) return;
      await transaction.review.update({ where: { id: reviewId }, data: { reportCount: 0 } });
      await this.audit(transaction, actorId, ReviewAuditAction.CLEAR_REPORTS, reviewId, {
        cleared: removed.count,
      });
    });
    return this.detail(reviewId);
  }

  private async detail(reviewId: string): Promise<AdminReviewResponse> {
    const row = await this.prisma.review.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: adminReviewSelect,
    });
    if (!row) throw reviewNotFound();
    const items = await this.orders.purchasedItems([row.orderItemId]);
    return toAdminReview(row, items.get(row.orderItemId));
  }

  /** Khoa dong danh gia; co `expectedEditCount` thi doi chieu phien ban ngay trong khoa. */
  private async lock(
    transaction: Prisma.TransactionClient,
    reviewId: string,
    expectedEditCount?: number,
  ): Promise<LockedReview> {
    const locked = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM public.reviews
      WHERE id = ${reviewId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    if (locked.length === 0) throw reviewNotFound();
    const current = await transaction.review.findUniqueOrThrow({
      where: { id: reviewId },
      select: {
        moderationStatus: true,
        productId: true,
        replyContent: true,
        reportCount: true,
        editCount: true,
      },
    });
    if (expectedEditCount !== undefined && current.editCount !== expectedEditCount) {
      throw reviewChanged();
    }
    return current;
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    actorId: string,
    action: ReviewAuditAction,
    reviewId: string,
    metadata: Prisma.InputJsonObject,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorUserId: actorId,
        action,
        entityType: AUDIT_ENTITY_REVIEW,
        entityId: reviewId,
        metadata,
      },
    });
  }
}
