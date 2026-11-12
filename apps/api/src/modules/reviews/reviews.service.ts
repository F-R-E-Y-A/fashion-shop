import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersService } from '../orders/index.js';
import { ProductsService } from '../products/index.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type {
  OrderReviewItemContext,
  OrderReviewsContextResponse,
} from './dto/order-review-context.response.js';
import type { PublicReviewsResponse } from './dto/public-reviews.response.js';
import type { PublicReviewsQueryDto } from './dto/public-reviews-query.dto.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Lay context danh gia cho tung dong hang cua mot don hang cu the.
   * Yeu cau phai la chu so huu cua don hang.
   */
  async getOrderReviewContext(
    orderId: string,
    userId: string,
  ): Promise<OrderReviewsContextResponse> {
    const eligibility = await this.ordersService.getReviewEligibility(orderId, userId);
    if (eligibility.items.length === 0) {
      return { orderId, items: [] };
    }

    const orderItemIds = eligibility.items.map((item) => item.orderItemId);
    const existingReviews = await this.prisma.review.findMany({
      where: {
        orderItemId: { in: orderItemIds },
        userId,
      },
    });
    const reviewByItemId = new Map(existingReviews.map((r) => [r.orderItemId, r]));

    const items: OrderReviewItemContext[] = eligibility.items.map((item) => {
      const existing = reviewByItemId.get(item.orderItemId);
      if (existing) {
        return {
          orderItemId: item.orderItemId,
          productVariantId: item.productVariantId,
          productId: item.productId,
          eligible: false,
          reasonCode: 'ALREADY_REVIEWED',
          review: {
            id: existing.id,
            rating: existing.rating,
            content: existing.content,
            moderationStatus: existing.moderationStatus,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
          },
        };
      }

      if (!eligibility.hasDeliveredHistory) {
        return {
          orderItemId: item.orderItemId,
          productVariantId: item.productVariantId,
          productId: item.productId,
          eligible: false,
          reasonCode: 'NOT_DELIVERED',
          review: null,
        };
      }

      return {
        orderItemId: item.orderItemId,
        productVariantId: item.productVariantId,
        productId: item.productId,
        eligible: true,
        reasonCode: null,
        review: null,
      };
    });

    return { orderId, items };
  }

  /**
   * Gui danh gia moi cho mot dong hang.
   * Xac thuc quyen so huu, lich su DELIVERED, idempotency va concurrency.
   */
  async createReview(userId: string, dto: CreateReviewDto) {
    const eligibility = await this.ordersService.getOrderItemReviewEligibility(
      dto.orderItemId,
      userId,
    );

    if (!eligibility.hasDeliveredHistory) {
      throw new UnprocessableEntityException(
        'Đơn hàng chưa từng giao thành công nên chưa thể đánh giá.',
      );
    }

    const normalizedRating = dto.rating;
    const normalizedContent = dto.content ? dto.content.trim() : null;

    // Kiem tra review da ton tai cho orderItemId nay
    const existing = await this.prisma.review.findUnique({
      where: { orderItemId: dto.orderItemId },
    });

    if (existing) {
      if (existing.deletedAt !== null) {
        throw new ConflictException('Đánh giá cho sản phẩm này đã bị xóa.');
      }
      if (
        existing.userId === userId &&
        existing.rating === normalizedRating &&
        (existing.content ?? null) === normalizedContent
      ) {
        return {
          id: existing.id,
          orderItemId: existing.orderItemId,
          productId: existing.productId,
          rating: existing.rating,
          content: existing.content,
          moderationStatus: existing.moderationStatus,
          createdAt: existing.createdAt.toISOString(),
          updatedAt: existing.updatedAt.toISOString(),
        };
      }
      throw new ConflictException('Dòng hàng này đã được đánh giá.');
    }

    try {
      const created = await this.prisma.review.create({
        data: {
          userId,
          productId: eligibility.productId,
          orderItemId: dto.orderItemId,
          rating: normalizedRating,
          content: normalizedContent,
          moderationStatus: 'PENDING',
        },
      });

      return {
        id: created.id,
        orderItemId: created.orderItemId,
        productId: created.productId,
        rating: created.rating,
        content: created.content,
        moderationStatus: created.moderationStatus,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (err: unknown) {
      // Xu ly tranh chap dong thoi (P2002 tren unique orderItemId)
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        const committed = await this.prisma.review.findUnique({
          where: { orderItemId: dto.orderItemId },
        });
        if (committed && committed.userId === userId) {
          if (committed.deletedAt !== null) {
            throw new ConflictException('Đánh giá cho sản phẩm này đã bị xóa.');
          }
          if (
            committed.rating === normalizedRating &&
            (committed.content ?? null) === normalizedContent
          ) {
            return {
              id: committed.id,
              orderItemId: committed.orderItemId,
              productId: committed.productId,
              rating: committed.rating,
              content: committed.content,
              moderationStatus: committed.moderationStatus,
              createdAt: committed.createdAt.toISOString(),
              updatedAt: committed.updatedAt.toISOString(),
            };
          }
          throw new ConflictException('Dòng hàng này đã được đánh giá.');
        }
      }
      throw err;
    }
  }

  /**
   * Lay danh sach danh gia cong khai cua san pham theo slug.
   * Chi tra ve cac danh gia APPROVED, deletedAt = null va san pham dang hien thi tren storefront.
   */
  async getPublicProductReviews(
    slug: string,
    query: PublicReviewsQueryDto,
  ): Promise<PublicReviewsResponse> {
    const product = await this.productsService.findBySlug(slug);
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm: ${slug}`);
    }

    const where: Prisma.ReviewWhereInput = {
      productId: product.id,
      moderationStatus: 'APPROVED',
      deletedAt: null,
    };

    const skip = (query.page - 1) * query.pageSize;
    const take = query.pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        select: {
          id: true,
          rating: true,
          content: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items: items.map((i) => ({
        id: i.id,
        rating: i.rating,
        content: i.content,
        createdAt: i.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
