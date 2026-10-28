import { randomUUID } from 'node:crypto';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';

import {
  flatParams,
  hmac,
  pipeString,
  queryRequestFields,
  queryResponseFields,
  queryString,
  refundRequestFields,
  refundResponseFields,
  validHash,
  vnpDate,
  type VnpParams,
} from './vnpay-signature.js';

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);
  constructor(private readonly config: ConfigService) {}

  configured() {
    return (
      !!this.config.get<string>('VNPAY_TMN_CODE') && !!this.config.get<string>('VNPAY_HASH_SECRET')
    );
  }

  private credentials() {
    if (!this.configured())
      throw new ServiceUnavailableException('Chưa cấu hình VNPAY sandbox. Vui lòng thử lại sau.');
    return {
      merchant: this.config.getOrThrow<string>('VNPAY_TMN_CODE'),
      secret: this.config.getOrThrow<string>('VNPAY_HASH_SECRET'),
    };
  }

  private gatewayUrl(key: string, fallback: string) {
    const url = new URL(this.config.get<string>(key) || fallback);
    const testLoopback =
      this.config.get<string>('NODE_ENV') === 'test' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      !testLoopback &&
      (url.protocol !== 'https:' ||
        !['sandbox.vnpayment.vn', 'pay.vnpay.vn'].includes(url.hostname))
    ) {
      throw new ServiceUnavailableException('Cấu hình URL VNPAY không hợp lệ.');
    }
    return url.toString();
  }

  create(reference: string, amount: string, expiresAt: Date, ip: string) {
    const { merchant, secret } = this.credentials();
    const minor = new Decimal(amount).times(100);
    if (!minor.isInteger() || minor.lte(0) || minor.gte('1000000000000'))
      throw new ServiceUnavailableException('Số tiền ngoài giới hạn VNPAY.');
    const returnUrl =
      this.config.get<string>('VNPAY_RETURN_URL') || 'http://localhost:5174/thanh-toan/ket-qua';
    const params: VnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: merchant,
      vnp_Amount: minor.toFixed(0),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: reference,
      vnp_OrderInfo: `Thanh toan Freya ${reference}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ip.replace(/^::ffff:/u, ''),
      vnp_CreateDate: vnpDate(new Date()),
      vnp_ExpireDate: vnpDate(expiresAt),
    };
    const data = queryString(params);
    return `${this.gatewayUrl('VNPAY_PAYMENT_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html')}?${data}&vnp_SecureHash=${hmac(secret, data)}`;
  }

  verifyIpn(raw: Record<string, unknown>): VnpParams | null {
    if (!this.configured()) return null;
    const params = flatParams(raw);
    return params &&
      validHash(this.credentials().secret, queryString(params), params.vnp_SecureHash)
      ? params
      : null;
  }

  matches(params: VnpParams, reference: string, amount: string) {
    return (
      params.vnp_TmnCode === this.credentials().merchant &&
      params.vnp_TxnRef === reference &&
      /^\d+$/u.test(params.vnp_Amount ?? '') &&
      new Decimal(params.vnp_Amount!).eq(new Decimal(amount).times(100)) &&
      (!params.vnp_CurrCode || params.vnp_CurrCode === 'VND')
    );
  }

  async query(reference: string, checkoutUrl: string): Promise<VnpParams | null> {
    const { merchant, secret } = this.credentials();
    const params: VnpParams = {
      vnp_RequestId: randomUUID().replaceAll('-', ''),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: merchant,
      vnp_TxnRef: reference,
      vnp_TransactionDate: new URL(checkoutUrl).searchParams.get('vnp_CreateDate')!,
      vnp_CreateDate: vnpDate(new Date()),
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: `Query ${reference}`,
    };
    params.vnp_SecureHash = hmac(secret, pipeString(params, queryRequestFields));
    const response = await fetch(
      this.gatewayUrl(
        'VNPAY_QUERY_URL',
        'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      this.logger.warn(`QueryDR HTTP ${response.status}; payment stays pending.`);
      return null;
    }
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const data = flatParams(raw as Record<string, unknown>);
    if (
      !data ||
      !validHash(secret, pipeString(data, queryResponseFields), data.vnp_SecureHash) ||
      data.vnp_ResponseCode !== '00' ||
      data.vnp_Command !== 'querydr' ||
      data.vnp_TransactionType !== '01'
    ) {
      // Chi ghi ma phan hoi cong khai (vd 94 = query trung trong 5 phut), khong ghi payload/chu ky.
      this.logger.warn(`QueryDR not usable: ResponseCode=${data?.vnp_ResponseCode ?? 'n/a'}.`);
      return null;
    }
    return data;
  }

  /**
   * Refund API v2.1.0: 02 hoan toan phan con lai, 03 hoan mot phan. Chi ghi nhan khi
   * ResponseCode 00 va chu ky phan hoi dung; ma khac chi log cong khai de admin thu lai.
   */
  async refund(
    reference: string,
    checkoutUrl: string,
    amount: string,
    actor: string,
    full = true,
  ): Promise<{ requestId: string; payload: VnpParams }> {
    const { merchant, secret } = this.credentials();
    const requestId = randomUUID().replaceAll('-', '');
    const params: VnpParams = {
      vnp_RequestId: requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: merchant,
      vnp_Amount: new Decimal(amount).times(100).toFixed(0),
      vnp_TxnRef: reference,
      vnp_TransactionDate: new URL(checkoutUrl).searchParams.get('vnp_CreateDate')!,
      vnp_TransactionType: full ? '02' : '03',
      vnp_CreateBy: actor,
      vnp_CreateDate: vnpDate(new Date()),
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: `Hoan tien ${reference}`,
    };
    params.vnp_SecureHash = hmac(secret, pipeString(params, refundRequestFields));
    const response = await fetch(
      this.gatewayUrl(
        'VNPAY_REFUND_URL',
        'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction/Refund',
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new ServiceUnavailableException('Refund API chưa phản hồi.');
    const raw: unknown = await response.json();
    const data =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? flatParams(raw as Record<string, unknown>)
        : null;
    if (
      !data ||
      !validHash(secret, pipeString(data, refundResponseFields), data.vnp_SecureHash) ||
      data.vnp_RequestId !== requestId ||
      data.vnp_TmnCode !== merchant ||
      data.vnp_TxnRef !== reference
    ) {
      this.logger.warn(
        `Refund response not usable: ResponseCode=${data?.vnp_ResponseCode ?? 'n/a'}.`,
      );
      throw new ServiceUnavailableException('Phản hồi hoàn tiền không hợp lệ.');
    }
    if (data.vnp_ResponseCode !== '00') {
      this.logger.warn(`Refund rejected: ResponseCode=${data.vnp_ResponseCode}.`);
      throw new ServiceUnavailableException(
        `Cổng từ chối hoàn tiền (mã ${data.vnp_ResponseCode}).`,
      );
    }
    return { requestId, payload: data };
  }
}
