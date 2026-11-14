import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { InventoryModule } from '../inventory/index.js';
import { OrdersModule } from '../orders/index.js';
import { PaymentsModule } from '../payments/index.js';
import { AdminShipmentController } from './admin-shipment.controller.js';
import { ShipmentWebhookController } from './shipment-webhook.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  imports: [AuthModule, OrdersModule, InventoryModule, PaymentsModule],
  controllers: [AdminShipmentController, ShipmentWebhookController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
