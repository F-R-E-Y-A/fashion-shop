import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

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
