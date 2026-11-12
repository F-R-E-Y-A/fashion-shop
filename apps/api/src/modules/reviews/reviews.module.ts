import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { OrdersModule } from '../orders/index.js';
import { ProductsModule } from '../products/index.js';
import { PublicReviewsController } from './public-reviews.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [AuthModule, OrdersModule, ProductsModule],
  controllers: [ReviewsController, PublicReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
