import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { InventoryModule } from '../inventory/index.js';
import { ProductsModule } from '../products/index.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';

@Module({
  imports: [AuthModule, ProductsModule, InventoryModule],
  controllers: [CartController],
  providers: [CartService, OptionalAuthGuard],
  exports: [CartService],
})
export class CartModule {}
