import { Module } from '@nestjs/common';

import { GatewayRegistry } from './gateway-registry.js';
import { MomoAdapter, MomoAtmAdapter } from './momo.adapter.js';
import { PaymentsService } from './payments.service.js';
import { VnpayAdapter } from './vnpay.adapter.js';
import { VnpayService } from './vnpay.service.js';
@Module({
  providers: [
    PaymentsService,
    VnpayService,
    VnpayAdapter,
    MomoAdapter,
    MomoAtmAdapter,
    GatewayRegistry,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
