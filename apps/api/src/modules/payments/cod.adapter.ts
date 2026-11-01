import { Injectable } from '@nestjs/common';

import type {
  GatewayCode,
  GatewayRequest,
  PaymentEvent,
  PaymentGateway,
  PaymentInput,
} from './payment-gateway.js';

/**
 * COD khong phai cong thanh toan tu xa: khong URL, khong IPN, khong query.
 * Tien mat duoc thu khi giao hang; checkout.service.codCollected la diem chot
 * tien chuyen trang thai don va kho giong nhu IPN thanh toan online.
 */
@Injectable()
export class CodAdapter implements PaymentGateway {
  readonly code: GatewayCode = 'COD';
  readonly label: string = 'COD — thanh toán khi nhận hàng';
  readonly queryIntervalMs = 3_600_000;
  configured() {
    return true;
  }
  prepare(_input: PaymentInput): string | null {
    return null;
  }
  async createRemote(_input: PaymentInput, _request?: GatewayRequest): Promise<string> {
    return '';
  }
  notification(_raw: Record<string, unknown>): PaymentEvent | null {
    return null;
  }
  matches(_event: PaymentEvent, _reference: string, _amount: string): boolean {
    return false;
  }
  async query(_reference: string, _checkoutUrl: string | null): Promise<PaymentEvent | null> {
    return null;
  }
}
