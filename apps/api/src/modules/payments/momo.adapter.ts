import { randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';

import {
  momoData,
  momoHash,
  momoNotificationFields,
  momoParams,
  momoValidHash,
} from './momo-signature.js';
import type {
  GatewayCode,
  GatewayRequest,
  PaymentEvent,
  PaymentGateway,
  PaymentInput,
} from './payment-gateway.js';

const finalFailures = new Set([
  '98',
  '99',
  '1001',
  '1002',
  '1003',
  '1004',
  '1005',
  '1006',
  '1007',
  '1017',
  '1026',
  '2019',
  '4001',
  '4002',
  '4100',
]);

@Injectable()
export class MomoAdapter implements PaymentGateway {
  readonly code: GatewayCode = 'MOMO';
  readonly label: string = 'MoMo';
  readonly queryIntervalMs = 60_000;
  /** captureWallet hien QR/dang nhap vi; payWithATM hien form the tren trang MoMo. */
  protected requestType = 'captureWallet';
  constructor(protected readonly config: ConfigService) {}
  configured() {
    return ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'].every(
      (key) => !!this.config.get<string>(key),
    );
  }
  private credentials() {
    if (!this.configured()) throw new ServiceUnavailableException('Chưa cấu hình MoMo sandbox.');
    return {
      partner: this.config.getOrThrow<string>('MOMO_PARTNER_CODE'),
      access: this.config.getOrThrow<string>('MOMO_ACCESS_KEY'),
      secret: this.config.getOrThrow<string>('MOMO_SECRET_KEY'),
    };
  }
  private trustedUrl(value: string) {
    const url = new URL(value);
    const test =
      this.config.get<string>('NODE_ENV') === 'test' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      !test &&
      (url.protocol !== 'https:' ||
        !['test-payment.momo.vn', 'payment.momo.vn'].includes(url.hostname))
    )
      throw new ServiceUnavailableException('URL cổng MoMo không hợp lệ.');
    return url.toString();
  }
  prepare(input: PaymentInput): null {
    this.credentials();
    const amount = new Decimal(input.amount);
    if (!amount.isInteger() || amount.lt(1000) || amount.gt(50_000_000))
      throw new ServiceUnavailableException(
        'MoMo hỗ trợ số tiền từ 1.000đ đến 50.000.000đ, không có phần lẻ.',
      );
    this.trustedUrl(
      this.config.get<string>('MOMO_API_URL') || 'https://test-payment.momo.vn/v2/gateway/api',
    );
    const ipn = this.config.get<string>('MOMO_IPN_URL');
    if (
      !ipn ||
      (new URL(ipn).protocol !== 'https:' && this.config.get<string>('NODE_ENV') !== 'test')
    )
      throw new ServiceUnavailableException('Cần cấu hình IPN HTTPS cho MoMo.');
    return null;
  }
  private async post(action: 'create' | 'query', body: Record<string, unknown>) {
    const base =
      this.config.get<string>('MOMO_API_URL') || 'https://test-payment.momo.vn/v2/gateway/api';
    const response = await fetch(this.trustedUrl(`${base.replace(/\/$/u, '')}/${action}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35_000),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        'MoMo chưa phản hồi kết quả. Đơn được giữ để đối soát.',
      );
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return momoParams(raw as Record<string, unknown>);
  }
  request(input: PaymentInput): GatewayRequest {
    this.prepare(input);
    const { partner, access, secret } = this.credentials();
    const data = {
      amount: new Decimal(input.amount).toFixed(0),
      extraData: '',
      ipnUrl: this.config.getOrThrow<string>('MOMO_IPN_URL'),
      orderId: input.reference,
      orderInfo: `Thanh toan Freya ${input.reference}`,
      partnerCode: partner,
      redirectUrl:
        this.config.get<string>('MOMO_RETURN_URL') || 'http://localhost:5174/thanh-toan/ket-qua',
      requestId: input.reference,
      requestType: this.requestType,
    };
    const signature = momoHash(
      secret,
      momoData(access, data, [
        'amount',
        'extraData',
        'ipnUrl',
        'orderId',
        'orderInfo',
        'partnerCode',
        'redirectUrl',
        'requestId',
        'requestType',
      ]),
    );
    return { ...data, amount: Number(data.amount), signature, autoCapture: true, lang: 'vi' };
  }
  async createRemote(input: PaymentInput, request: GatewayRequest = this.request(input)) {
    const { partner, access, secret } = this.credentials();
    const result = await this.post('create', request);
    if (
      !result ||
      result.resultCode !== '0' ||
      result.partnerCode !== partner ||
      result.orderId !== input.reference ||
      result.requestId !== input.reference ||
      !/^\d+$/u.test(result.amount ?? '') ||
      !new Decimal(result.amount!).eq(input.amount) ||
      !result.payUrl
    )
      throw new ServiceUnavailableException(
        'Chưa nhận được liên kết MoMo hợp lệ. Đơn được giữ để kiểm tra lại.',
      );
    if (
      result.signature &&
      !momoValidHash(
        secret,
        momoData(access, result, [
          'amount',
          'orderId',
          'partnerCode',
          'payUrl',
          'requestId',
          'responseTime',
          'resultCode',
        ]),
        result.signature,
      )
    )
      throw new ServiceUnavailableException('Chữ ký phản hồi MoMo không hợp lệ.');
    return this.trustedUrl(result.payUrl);
  }
  notification(raw: Record<string, unknown>) {
    if (!this.configured()) return null;
    const data = momoParams(raw);
    const { access, secret } = this.credentials();
    if (
      !data ||
      !momoValidHash(secret, momoData(access, data, momoNotificationFields), data.signature)
    )
      return null;
    return this.event(data);
  }
  matches(event: PaymentEvent, reference: string, amount: string) {
    return (
      event.raw.partnerCode === this.credentials().partner &&
      event.reference === reference &&
      /^\d+$/u.test(event.raw.amount ?? '') &&
      new Decimal(event.raw.amount!).eq(amount)
    );
  }
  async query(reference: string, _checkoutUrl: string | null) {
    const { partner, access, secret } = this.credentials();
    const data = { orderId: reference, partnerCode: partner, requestId: randomUUID() };
    const signature = momoHash(
      secret,
      momoData(access, data, ['orderId', 'partnerCode', 'requestId']),
    );
    const result = await this.post('query', { ...data, signature, lang: 'vi' });
    // Query khong cong bo chu ky response: chi nhan tu HTTPS allowlist va khop request/merchant/order.
    if (
      !result ||
      result.partnerCode !== partner ||
      result.requestId !== data.requestId ||
      result.orderId !== reference
    )
      return null;
    return this.event(result);
  }
  private event(raw: Record<string, string>): PaymentEvent {
    const code = raw.resultCode ?? '';
    return {
      gateway: this.code,
      reference: raw.orderId ?? '',
      state: code === '0' ? 'SUCCEEDED' : finalFailures.has(code) ? 'FAILED' : 'PENDING',
      receipt: code === '0' ? (raw.transId ?? '') : `FAIL:${raw.orderId}:${code}`,
      raw,
    };
  }
}

/**
 * Bien the MOMO_ATM: cung khoa, IPN, query va settlement voi MomoAdapter; chi khac
 * requestType payWithATM de trang MoMo hien form the ATM/quoc te thay vi QR vi.
 */
@Injectable()
export class MomoAtmAdapter extends MomoAdapter {
  override readonly code: GatewayCode = 'MOMO_ATM';
  override readonly label: string = 'MoMo — thẻ ATM/thẻ quốc tế';
  protected override requestType = 'payWithATM';
}
