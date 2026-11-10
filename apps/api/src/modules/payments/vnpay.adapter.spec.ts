import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VnpayAdapter } from './vnpay.adapter.js';
import { VnpayService } from './vnpay.service.js';
import { hmac, pipeString, queryResponseFields, queryString } from './vnpay-signature.js';

const secret = 'adapter-test-secret-not-a-merchant-key';
const reference = 'P_ADAPTER_TEST';
const adapter = () =>
  new VnpayAdapter(
    new VnpayService(
      new ConfigService({
        VNPAY_TMN_CODE: 'TESTONLY',
        VNPAY_HASH_SECRET: secret,
      }),
    ),
  );
afterEach(() => vi.unstubAllGlobals());

describe('PH-11 VNPAY transaction status contract', () => {
  it.each([
    ['00', '00', 'SUCCEEDED'],
    ['24', '02', 'FAILED'],
    ['00', '11', 'FAILED'],
    ['11', '08', 'FAILED'],
    ['00', '09', 'PENDING'],
    ['07', '07', 'PENDING'],
    ['00', '01', 'PENDING'],
    ['00', '99', 'PENDING'],
  ])(
    'UC-08.2/AC8 response=%s transaction=%s phải là %s sau xác thực chữ ký',
    (response, status, state) => {
      const params = {
        vnp_TmnCode: 'TESTONLY',
        vnp_TxnRef: reference,
        vnp_Amount: '23000000',
        vnp_ResponseCode: response,
        vnp_TransactionStatus: status,
        vnp_TransactionNo: '12345678',
      };
      const event = adapter().notification({
        ...params,
        vnp_SecureHash: hmac(secret, queryString(params)),
      });
      expect(event?.state).toBe(state);
    },
  );
  it('UC-08.2/AC8 QueryDR success với TransactionStatus11 vẫn là giao dịch hủy, không ghi thu', async () => {
    const data = {
      vnp_ResponseId: 'QUERY1',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'QueryDR success',
      vnp_TmnCode: 'TESTONLY',
      vnp_TxnRef: reference,
      vnp_Amount: '23000000',
      vnp_OrderInfo: 'Query test',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '',
      vnp_TransactionNo: '12345678',
      vnp_TransactionType: '01',
      vnp_TransactionStatus: '11',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...data,
            vnp_SecureHash: hmac(secret, pipeString(data, queryResponseFields)),
          }),
        ),
      ),
    );
    const event = await adapter().query(
      reference,
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_CreateDate=20261018220000',
    );
    expect(event?.state).toBe('FAILED');
    expect(event?.gateway).toBe('VNPAY');
  });
});
