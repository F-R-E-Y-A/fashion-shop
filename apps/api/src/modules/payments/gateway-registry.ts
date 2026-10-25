import { Injectable } from '@nestjs/common';

import { MomoAdapter, MomoAtmAdapter } from './momo.adapter.js';
import type { GatewayCode, PaymentGateway } from './payment-gateway.js';
import { VnpayAdapter } from './vnpay.adapter.js';

@Injectable()
export class GatewayRegistry {
  private readonly adapters: ReadonlyMap<GatewayCode, PaymentGateway>;
  constructor(vnpay: VnpayAdapter, momo: MomoAdapter, momoAtm: MomoAtmAdapter) {
    this.adapters = new Map<GatewayCode, PaymentGateway>([
      [vnpay.code, vnpay],
      [momo.code, momo],
      [momoAtm.code, momoAtm],
    ]);
  }
  get(code: GatewayCode): PaymentGateway {
    return this.adapters.get(code)!;
  }
  list() {
    return [...this.adapters.values()].map((adapter) => ({
      code: adapter.code,
      label: adapter.label,
      configured: adapter.configured(),
    }));
  }
}
