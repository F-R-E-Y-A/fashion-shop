import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { CartModule } from '../cart/index.js';
import { InventoryModule } from '../inventory/index.js';
import { OrdersModule } from '../orders/index.js';
import { PaymentsModule } from '../payments/index.js';
import { ShippingModule } from '../shipping/index.js';
import { UsersModule } from '../users/index.js';
import {
  AdminPaymentsController,
  CheckoutController,
  MomoController,
  OrdersController,
  VnpayController,
} from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { SettlementService } from './settlement.service.js';
@Module({
  imports: [
    AuthModule,
    CartModule,
    InventoryModule,
    OrdersModule,
    PaymentsModule,
    ShippingModule,
    UsersModule,
  ],
  providers: [CheckoutService, SettlementService],
  controllers: [
    CheckoutController,
    OrdersController,
    VnpayController,
    MomoController,
    AdminPaymentsController,
  ],
})
export class CheckoutModule {}
