import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client.js';
import { ProductsService } from '../products/index.js';
import { ratingSummary } from './review-policy.js';

/**
 * Tinh lai diem san pham trong CUNG giao dich vua doi danh gia (ADR-054). Chi danh gia APPROVED,
 * chua xoa mem moi tinh; danh gia cho duyet hay bi an khong keo diem len xuong.
 */
@Injectable()
export class ReviewRatingService {
  constructor(private readonly products: ProductsService) {}

  recompute(productId: string, transaction: Prisma.TransactionClient): Promise<void> {
    return this.products.updateRatingSummary(productId, transaction, async () => {
      const rows = await transaction.review.groupBy({
        by: ['rating'],
        where: { productId, moderationStatus: 'APPROVED', deletedAt: null },
        _count: { _all: true },
      });
      return ratingSummary(rows.map((row) => ({ rating: row.rating, count: row._count._all })));
    });
  }
}
