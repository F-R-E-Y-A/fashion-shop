import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { InventoryModule } from '../inventory/index.js';
import { NotificationsModule } from '../notifications/index.js';
import { OrdersModule } from '../orders/index.js';
import { PaymentsModule } from '../payments/index.js';
import { PromotionsModule } from '../promotions/index.js';
import { AdminShipmentController } from './admin-shipment.controller.js';
import { GhnCarrierGateway } from './ghn.carrier.js';
import { MockCarrierGateway } from './mock.carrier.js';
import { ShipmentWebhookController } from './shipment-webhook.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  imports: [
    AuthModule,
    InventoryModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    PromotionsModule,
  ],
  controllers: [AdminShipmentController, ShipmentWebhookController],
  providers: [ShippingService, GhnCarrierGateway, MockCarrierGateway],
  exports: [ShippingService],
})
export class ShippingModule {}
