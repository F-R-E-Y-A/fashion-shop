import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    review: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let ordersService: {
    getReviewEligibility: ReturnType<typeof vi.fn>;
    getOrderItemReviewEligibility: ReturnType<typeof vi.fn>;
  };
  let productsService: {
    findBySlug: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      review: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    ordersService = {
      getReviewEligibility: vi.fn(),
      getOrderItemReviewEligibility: vi.fn(),
    };
    productsService = {
      findBySlug: vi.fn(),
    };
    service = new ReviewsService(prisma as never, ordersService as never, productsService as never);
  });

  describe('getOrderReviewContext', () => {
    it('tra danh sach rong neu don khong co dong hang', async () => {
      ordersService.getReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        hasDeliveredHistory: true,
        items: [],
      });

      const result = await service.getOrderReviewContext('order-1', 'user-1');
      expect(result).toEqual({ orderId: 'order-1', items: [] });
    });

    it('tra eligible: true khi don da DELIVERED va chua co danh gia', async () => {
      ordersService.getReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        hasDeliveredHistory: true,
        items: [{ orderItemId: 'item-1', productVariantId: 'var-1', productId: 'prod-1' }],
      });
      prisma.review.findMany.mockResolvedValue([]);

      const result = await service.getOrderReviewContext('order-1', 'user-1');
      expect(result.items).toEqual([
        {
          orderItemId: 'item-1',
          productVariantId: 'var-1',
          productId: 'prod-1',
          eligible: true,
          reasonCode: null,
          review: null,
        },
      ]);
    });

    it('tra eligible: false, NOT_DELIVERED khi don chua tung DELIVERED', async () => {
      ordersService.getReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        hasDeliveredHistory: false,
        items: [{ orderItemId: 'item-1', productVariantId: 'var-1', productId: 'prod-1' }],
      });
      prisma.review.findMany.mockResolvedValue([]);

      const result = await service.getOrderReviewContext('order-1', 'user-1');
      expect(result.items[0]).toEqual({
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        eligible: false,
        reasonCode: 'NOT_DELIVERED',
        review: null,
      });
    });

    it('tra eligible: false, ALREADY_REVIEWED va review hien co khi da danh gia', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        hasDeliveredHistory: true,
        items: [{ orderItemId: 'item-1', productVariantId: 'var-1', productId: 'prod-1' }],
      });
      prisma.review.findMany.mockResolvedValue([
        {
          id: 'rev-1',
          orderItemId: 'item-1',
          rating: 5,
          content: 'Sản phẩm đẹp',
          moderationStatus: 'PENDING',
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.getOrderReviewContext('order-1', 'user-1');
      expect(result.items[0]).toEqual({
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        eligible: false,
        reasonCode: 'ALREADY_REVIEWED',
        review: {
          id: 'rev-1',
          rating: 5,
          content: 'Sản phẩm đẹp',
          moderationStatus: 'PENDING',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      });
    });
  });

  describe('createReview', () => {
    it('chan 422 khi don chua tung DELIVERED', async () => {
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: false,
      });

      await expect(
        service.createReview('user-1', {
          orderItemId: 'item-1',
          rating: 5,
          content: 'Tuyệt vời',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('tao danh gia PENDING thanh cong khi du dieu kien', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: true,
      });
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'rev-new',
        orderItemId: 'item-1',
        productId: 'prod-1',
        rating: 5,
        content: 'Chất vải mát',
        moderationStatus: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });

      const res = await service.createReview('user-1', {
        orderItemId: 'item-1',
        rating: 5,
        content: '  Chất vải mát  ',
      });

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          productId: 'prod-1',
          orderItemId: 'item-1',
          rating: 5,
          content: 'Chất vải mát',
          moderationStatus: 'PENDING',
        },
      });
      expect(res.id).toBe('rev-new');
      expect(res.moderationStatus).toBe('PENDING');
    });

    it('tra ve ket qua cu (idempotent) khi gui lai cung orderItemId va payload chuan hoa', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: true,
      });
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-existing',
        userId: 'user-1',
        orderItemId: 'item-1',
        productId: 'prod-1',
        rating: 4,
        content: 'Khá ổn',
        moderationStatus: 'APPROVED',
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const res = await service.createReview('user-1', {
        orderItemId: 'item-1',
        rating: 4,
        content: 'Khá ổn',
      });

      expect(prisma.review.create).not.toHaveBeenCalled();
      expect(res.id).toBe('rev-existing');
      expect(res.moderationStatus).toBe('APPROVED');
    });

    it('chan 409 khi gui lai nhung khac rating hoac content', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: true,
      });
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-existing',
        userId: 'user-1',
        orderItemId: 'item-1',
        productId: 'prod-1',
        rating: 4,
        content: 'Khá ổn',
        moderationStatus: 'PENDING',
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await expect(
        service.createReview('user-1', {
          orderItemId: 'item-1',
          rating: 5, // Khac voi 4
          content: 'Khá ổn',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('chan 409 khi review da bi deletedAt != null', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: true,
      });
      prisma.review.findUnique.mockResolvedValue({
        id: 'rev-deleted',
        userId: 'user-1',
        orderItemId: 'item-1',
        productId: 'prod-1',
        rating: 4,
        content: 'Khá ổn',
        moderationStatus: 'REJECTED',
        deletedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await expect(
        service.createReview('user-1', {
          orderItemId: 'item-1',
          rating: 4,
          content: 'Khá ổn',
        }),
      ).rejects.toThrow('Đánh giá cho sản phẩm này đã bị xóa.');
    });

    it('xu ly P2002 tranh chap dong thoi tra row da commit neu cung payload', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      ordersService.getOrderItemReviewEligibility.mockResolvedValue({
        orderId: 'order-1',
        orderItemId: 'item-1',
        productVariantId: 'var-1',
        productId: 'prod-1',
        hasDeliveredHistory: true,
      });
      prisma.review.findUnique
        .mockResolvedValueOnce(null) // lan check dau tien khong thay
        .mockResolvedValueOnce({
          // lan check sau khi P2002
          id: 'rev-committed',
          userId: 'user-1',
          orderItemId: 'item-1',
          productId: 'prod-1',
          rating: 5,
          content: 'Tốt',
          moderationStatus: 'PENDING',
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      prisma.review.create.mockRejectedValue({ code: 'P2002' });

      const res = await service.createReview('user-1', {
        orderItemId: 'item-1',
        rating: 5,
        content: 'Tốt',
      });

      expect(res.id).toBe('rev-committed');
    });
  });

  describe('getPublicProductReviews', () => {
    it('nem NotFoundException khi san pham khong ton tai hoac bi an', async () => {
      productsService.findBySlug.mockResolvedValue(null);

      await expect(
        service.getPublicProductReviews('ao-thun', { page: 1, pageSize: 12 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('chi query reviews APPROVED, deletedAt = null va phan trang dung', async () => {
      const now = new Date('2026-11-12T00:00:00Z');
      productsService.findBySlug.mockResolvedValue({ id: 'prod-1', name: 'Áo thun' });
      prisma.$transaction.mockResolvedValue([
        [
          {
            id: 'rev-1',
            rating: 5,
            content: 'Đẹp',
            createdAt: now,
          },
        ],
        1,
      ]);

      const res = await service.getPublicProductReviews('ao-thun', {
        page: 1,
        pageSize: 12,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(res.total).toBe(1);
      expect(res.items).toEqual([
        {
          id: 'rev-1',
          rating: 5,
          content: 'Đẹp',
          createdAt: now.toISOString(),
        },
      ]);
    });
  });
});
