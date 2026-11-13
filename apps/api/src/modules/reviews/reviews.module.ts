import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { OrdersModule } from '../orders/index.js';
import { ProductsModule } from '../products/index.js';
import { UploadsModule } from '../uploads/index.js';
import { AdminReviewsController } from './admin-reviews.controller.js';
import { AdminReviewsService } from './admin-reviews.service.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';
import { ProductReviewsController } from './product-reviews.controller.js';
import { ReviewRatingService } from './review-ratings.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

/**
 * Danh gia va cham diem san pham (ADR-054). Phu thuoc mot chieu: reviews doc orders (dong don da
 * giao), products (slug, ghi diem) va uploads (kiem anh); khong phan he nao import nguoc lai.
 */
@Module({
  imports: [AuthModule, OrdersModule, ProductsModule, UploadsModule],
  controllers: [ProductReviewsController, ReviewsController, AdminReviewsController],
  providers: [ReviewsService, AdminReviewsService, ReviewRatingService, OptionalAuthGuard],
})
export class ReviewsModule {}
