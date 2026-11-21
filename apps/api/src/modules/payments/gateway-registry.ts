import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CodAdapter } from './cod.adapter.js';
import { MomoAdapter, MomoAtmAdapter } from './momo.adapter.js';
import type { GatewayCode, PaymentGateway } from './payment-gateway.js';
import { VnpayAdapter } from './vnpay.adapter.js';

@Injectable()
export class GatewayRegistry {
  private readonly adapters: ReadonlyMap<GatewayCode, PaymentGateway>;
  constructor(
    vnpay: VnpayAdapter,
    momo: MomoAdapter,
    momoAtm: MomoAtmAdapter,
    cod: CodAdapter,
    private readonly config: ConfigService,
  ) {
    this.adapters = new Map<GatewayCode, PaymentGateway>([
      [vnpay.code, vnpay],
      [momo.code, momo],
      [momoAtm.code, momoAtm],
      [cod.code, cod],
    ]);
  }
  get(code: GatewayCode): PaymentGateway {
    return this.adapters.get(code)!;
  }
  /**
   * Hoan qua API cong (ADR-111): adapter co refund, du khoa, va moi truong bat cong nay trong
   * REFUND_GATEWAYS. False thi hoan tay bang ma chuyen khoan; sandbox VNPAY chi nhan ket noi tu IP
   * Viet Nam nen staging o Singapore goi ra bi treo.
   */
  autoRefund(code: GatewayCode): boolean {
    const adapter = this.get(code);
    return !!adapter.refund && adapter.configured() && this.listed('REFUND_GATEWAYS', code);
  }
  /**
   * Moi truong co goi API truy van cua cong nay khong (QUERY_GATEWAYS, ADR-112). False thi worker va
   * reconcile khong goi ra; payment chi chot bang return co chu ky hoac IPN.
   */
  queryEnabled(code: GatewayCode): boolean {
    return this.listed('QUERY_GATEWAYS', code);
  }
  /** Bien bo trong la moi cong; `none` khong trung ma nao nen tat het. */
  private listed(key: 'REFUND_GATEWAYS' | 'QUERY_GATEWAYS', code: GatewayCode): boolean {
    // Doc moi lan goi nhu configured() cua adapter: chuoi ngan, va test ghi de ConfigService sau khi dung module.
    const value = this.config.get<string>(key);
    return !value || value.split(',').includes(code);
  }
  list() {
    return [...this.adapters.values()].map((adapter) => ({
      code: adapter.code,
      label: adapter.label,
      configured: adapter.configured(),
    }));
  }
}
