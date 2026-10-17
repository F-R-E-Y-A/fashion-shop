import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AdminPromotionsController } from './admin-promotions.controller.js';
import { AdminVouchersController } from './admin-vouchers.controller.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';
import { PromotionsController } from './promotions.controller.js';
import { PromotionsService } from './promotions.service.js';

@Module({
  imports: [AuthModule],
  controllers: [PromotionsController, AdminVouchersController, AdminPromotionsController],
  providers: [PromotionsService, OptionalAuthGuard],
  exports: [PromotionsService],
})
export class PromotionsModule {}
