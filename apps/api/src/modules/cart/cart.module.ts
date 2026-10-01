import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService, OptionalAuthGuard],
  exports: [CartService],
})
export class CartModule {}
