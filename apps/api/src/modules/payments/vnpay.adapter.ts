import { Injectable } from '@nestjs/common';

import type {
  PaymentEvent,
  PaymentGateway,
  PaymentInput,
  RefundRequest,
} from './payment-gateway.js';
import { VnpayService } from './vnpay.service.js';

@Injectable()
export class VnpayAdapter implements PaymentGateway {
  readonly code = 'VNPAY' as const;
  readonly label = 'VNPAY';
  readonly queryIntervalMs = 305_000;
  constructor(private readonly service: VnpayService) {}
  configured() {
    return this.service.configured();
  }
  prepare(input: PaymentInput) {
    return this.service.create(input.reference, input.amount, input.expiresAt, input.ip);
  }
  createRemote(input: PaymentInput) {
    return Promise.resolve(this.prepare(input));
  }
  notification(raw: Record<string, unknown>) {
    const data = this.service.verifyIpn(raw);
    return data ? this.event(data) : null;
  }
  matches(event: PaymentEvent, reference: string, amount: string) {
    return this.service.matches(event.raw, reference, amount);
  }
  async query(reference: string, checkoutUrl: string | null) {
    if (!checkoutUrl) return null;
    const data = await this.service.query(reference, checkoutUrl);
    return data ? this.event(data) : null;
  }
  refund(input: RefundRequest) {
    return this.service.refund(input.reference, input.checkoutUrl, input.amount, input.actor);
  }
  private event(raw: Record<string, string>): PaymentEvent {
    const success = raw.vnp_ResponseCode === '00' && raw.vnp_TransactionStatus === '00';
    return {
      gateway: this.code,
      reference: raw.vnp_TxnRef ?? '',
      state: success
        ? 'SUCCEEDED'
        : ['02', '08', '11'].includes(raw.vnp_TransactionStatus ?? '') ||
            raw.vnp_ResponseCode === '24'
          ? 'FAILED'
          : 'PENDING',
      receipt: success
        ? /^[1-9]\d{0,14}$/u.test(raw.vnp_TransactionNo ?? '')
          ? raw.vnp_TransactionNo!
          : ''
        : `FAIL:${raw.vnp_TxnRef}:${raw.vnp_ResponseCode}:${raw.vnp_TransactionStatus}`,
      raw,
    };
  }
}
