import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MomoAdapter } from './momo.adapter.js';

const settings = {
  NODE_ENV: 'test',
  MOMO_PARTNER_CODE: 'TESTMERCHANT',
  MOMO_ACCESS_KEY: 'test-access',
  MOMO_SECRET_KEY: 'isolated-test-secret',
  MOMO_API_URL: 'http://127.0.0.1:3102',
  MOMO_IPN_URL: 'https://shop.fixture.test/api/payments/momo/ipn',
  MOMO_RETURN_URL: 'https://shop.fixture.test/thanh-toan/ket-qua',
};
const input = {
  reference: 'PTEST',
  amount: '230000.00',
  expiresAt: new Date(Date.now() + 900000),
  ip: '127.0.0.1',
};
const adapter = (override: Record<string, string> = {}) =>
  new MomoAdapter(new ConfigService({ ...settings, ...override }));
afterEach(() => vi.unstubAllGlobals());

describe('PH-11 MoMo contract', () => {
  it('captureWallet signs the documented request and keeps a stable request/order identity', () => {
    const request = adapter().request(input);
    const expected =
      'accessKey=test-access&amount=230000&extraData=&ipnUrl=https://shop.fixture.test/api/payments/momo/ipn&orderId=PTEST&orderInfo=Thanh toan Freya PTEST&partnerCode=TESTMERCHANT&redirectUrl=https://shop.fixture.test/thanh-toan/ket-qua&requestId=PTEST&requestType=captureWallet';
    expect(request.signature).toBe(
      createHmac('sha256', settings.MOMO_SECRET_KEY).update(expected).digest('hex'),
    );
    expect(request).toMatchObject({
      amount: 230000,
      autoCapture: true,
      orderId: 'PTEST',
      requestId: 'PTEST',
    });
    expect(request).not.toHaveProperty('secretKey');
  });
  it('does not call a fake gateway outside tests and rejects fractional/out-of-range amounts', () => {
    expect(() => adapter({ NODE_ENV: 'development' }).prepare(input)).toThrow('URL cổng MoMo');
    expect(() => adapter().prepare({ ...input, amount: '1000.01' })).toThrow('không có phần lẻ');
    expect(() => adapter().prepare({ ...input, amount: '999' })).toThrow('1.000đ');
    expect(() => adapter({ MOMO_SECRET_KEY: '' }).prepare(input)).toThrow('Chưa cấu hình');
  });
  it('never redirects to an untrusted payUrl even when the gateway response reports success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          resultCode: 0,
          partnerCode: 'TESTMERCHANT',
          orderId: 'PTEST',
          requestId: 'PTEST',
          amount: 230000,
          payUrl: 'https://attacker.example/pay',
        }),
      ),
    );
    await expect(adapter().createRemote(input)).rejects.toThrow('URL cổng MoMo');
  });
  it('query correlates the returned requestId instead of accepting another transaction response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          resultCode: 0,
          partnerCode: 'TESTMERCHANT',
          orderId: 'PTEST',
          requestId: 'wrong-request',
          amount: 230000,
          transId: 1234,
        }),
      ),
    );
    expect(await adapter().query('PTEST', null)).toBeNull();
  });
});
