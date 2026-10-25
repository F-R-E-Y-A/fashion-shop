import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import { VnpayService } from './vnpay.service.js';
import { flatParams, hmac, queryString, vnpDate } from './vnpay-signature.js';

function gateway(values: Record<string, string> = {}) {
  return new VnpayService(
    new ConfigService({ VNPAY_TMN_CODE: 'TESTONLY', VNPAY_HASH_SECRET: 'test-secret', ...values }),
  );
}

describe('PH-11 VNPAY adapter', () => {
  it('signing canonicalizes ASCII keys/UTF8/spaces and omits both checksum fields', () => {
    expect(
      queryString({
        vnp_Z: 'a b+c',
        vnp_A: 'áo',
        vnp_SecureHash: 'old',
        vnp_SecureHashType: 'SHA512',
      }),
    ).toBe('vnp_A=%C3%A1o&vnp_Z=a+b%2Bc');
    expect(vnpDate(new Date('2026-10-18T18:34:56Z'))).toBe('20261019013456');
  });
  it('HMAC-SHA512 matches RFC4231 test case 2', () => {
    expect(hmac('Jefe', 'what do ya want for nothing?')).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    );
  });
  it('rejects duplicate parameters, bad hex hash and amount/merchant/currency mismatch', () => {
    expect(flatParams({ vnp_Amount: ['1', '2'] })).toBeNull();
    const service = gateway();
    expect(service.verifyIpn({ vnp_SecureHash: 'z'.repeat(128) })).toBeNull();
    expect(
      service.matches(
        { vnp_TmnCode: 'TESTONLY', vnp_TxnRef: 'P1', vnp_Amount: '10001' },
        'P1',
        '100.00',
      ),
    ).toBe(false);
    expect(
      service.matches(
        { vnp_TmnCode: 'TESTONLY', vnp_TxnRef: 'P1', vnp_Amount: '10000', vnp_CurrCode: 'USD' },
        'P1',
        '100.00',
      ),
    ).toBe(false);
  });
  it('refuses local/custom gateway outside tests and never provides mock fallback without keys', () => {
    expect(() =>
      gateway({ NODE_ENV: 'development', VNPAY_PAYMENT_URL: 'http://127.0.0.1:1234/pay' }).create(
        'P1',
        '100.00',
        new Date(),
        '127.0.0.1',
      ),
    ).toThrow('URL VNPAY');
    expect(() =>
      gateway({ VNPAY_HASH_SECRET: '' }).create('P1', '100.00', new Date(), '127.0.0.1'),
    ).toThrow('Chưa cấu hình');
  });
});

describe('PH-11 VNPAY refund', () => {
  const checkoutUrl =
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_CreateDate=20261025120000';
  it('ký refund request theo tài liệu và chỉ nhận phản hồi có chữ khớp requestId/merchant', async () => {
    vi.resetModules();
    const { VnpayService: Service } = await import('./vnpay.service.js');
    const { default: nodeCrypto } = await import('node:crypto');
    const secret = 'refund-test-secret';
    const service = new Service(
      new ConfigService({
        NODE_ENV: 'test',
        VNPAY_TMN_CODE: 'TESTONLY',
        VNPAY_HASH_SECRET: secret,
        VNPAY_REFUND_URL: 'http://127.0.0.1:3999/refund',
      }),
    );
    let sent: Record<string, string> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { body: string }) => {
        sent = JSON.parse(init.body);
        const reply: Record<string, string> = {
          vnp_RequestId: sent!.vnp_RequestId!,
          vnp_ResponseCode: '00',
          vnp_TmnCode: 'TESTONLY',
          vnp_Amount: sent!.vnp_Amount!,
          vnp_TxnRef: sent!.vnp_TxnRef!,
          vnp_TransactionDate: sent!.vnp_TransactionDate!,
          vnp_TransactionType: '02',
          vnp_CreateBy: sent!.vnp_CreateBy!,
          vnp_CreateDate: sent!.vnp_CreateDate!,
          vnp_IpAddr: sent!.vnp_IpAddr!,
          vnp_OrderInfo: sent!.vnp_OrderInfo!,
          vnp_Message: 'Ok',
        };
        const { pipeString, hmac, refundResponseFields } = await import('./vnpay-signature.js');
        reply.vnp_SecureHash = hmac(secret, pipeString(reply, refundResponseFields));
        return Response.json(reply);
      }),
    );
    const result = await service.refund('PREF1', checkoutUrl, '50000.00', 'admin-1');
    expect(result.requestId).toBe(sent!.vnp_RequestId);
    const { pipeString, hmac, refundRequestFields } = await import('./vnpay-signature.js');
    expect(sent!.vnp_SecureHash).toBe(hmac(secret, pipeString(sent!, refundRequestFields)));
    expect(sent).toMatchObject({
      vnp_Command: 'refund',
      vnp_TxnRef: 'PREF1',
      vnp_Amount: '5000000',
      vnp_TransactionDate: '20261025120000',
      vnp_TransactionType: '02',
    });
    expect(typeof nodeCrypto.randomUUID).toBe('function');
    vi.unstubAllGlobals();
  });
  it('từ chối khi phản hồi sai mã hoặc sai chữ ký, không tạo kết quả bừa', async () => {
    const secret = 'refund-test-secret';
    const service = new VnpayService(
      new ConfigService({
        NODE_ENV: 'test',
        VNPAY_TMN_CODE: 'TESTONLY',
        VNPAY_HASH_SECRET: secret,
        VNPAY_REFUND_URL: 'http://127.0.0.1:3999/refund',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          vnp_RequestId: 'other',
          vnp_ResponseCode: '00',
          vnp_TmnCode: 'TESTONLY',
          vnp_SecureHash: 'a'.repeat(128),
        }),
      ),
    );
    await expect(service.refund('PREF1', checkoutUrl, '50000.00', 'admin-1')).rejects.toThrow(
      'Phản hồi hoàn tiền không hợp lệ.',
    );
    vi.unstubAllGlobals();
  });
});
