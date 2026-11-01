import { createHmac } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MomoAdapter, MomoAtmAdapter } from './momo.adapter.js';

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
  it('MOMO_ATM: biến thể thẻ ký requestType payWithATM, cùng khóa và phiên bản chữ ký', () => {
    const atm = new MomoAtmAdapter(new ConfigService({ ...settings }));
    const request = atm.request(input);
    const expected =
      'accessKey=test-access&amount=230000&extraData=&ipnUrl=https://shop.fixture.test/api/payments/momo/ipn&orderId=PTEST&orderInfo=Thanh toan Freya PTEST&partnerCode=TESTMERCHANT&redirectUrl=https://shop.fixture.test/thanh-toan/ket-qua&requestId=PTEST&requestType=payWithATM';
    expect(atm.code).toBe('MOMO_ATM');
    expect(request.requestType).toBe('payWithATM');
    expect(request.signature).toBe(
      createHmac('sha256', settings.MOMO_SECRET_KEY).update(expected).digest('hex'),
    );
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
  const refundInput = {
    reference: 'PTEST',
    checkoutUrl: 'https://test-payment.momo.vn/pay',
    amount: '230000.00',
    actor: 'admin',
    full: true,
    transactionNo: '4088878653',
  };
  const echo = (override: Record<string, unknown> = {}) => {
    const fetch = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      return Response.json({
        partnerCode: 'TESTMERCHANT',
        orderId: body.orderId,
        requestId: body.requestId,
        amount: body.amount,
        transId: 4088878999,
        resultCode: 0,
        message: 'Thành công.',
        responseTime: 1730000000000,
        ...override,
      });
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };
  it('refund: ký đúng các trường tài liệu, orderId mới khác đơn gốc, hoàn theo transId lúc thu', async () => {
    const fetch = echo();
    const result = await adapter().refund(refundInput);
    const [url, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(init.body) as Record<string, string | number>;
    expect(url).toBe('http://127.0.0.1:3102/refund');
    expect(body).toMatchObject({
      amount: 230000,
      transId: 4088878653,
      partnerCode: 'TESTMERCHANT',
    });
    expect(body.orderId).not.toBe('PTEST');
    expect(body.requestId).toBe(result.requestId);
    const raw = `accessKey=test-access&amount=230000&description=Hoan tien PTEST&orderId=${body.orderId}&partnerCode=TESTMERCHANT&requestId=${body.requestId}&transId=4088878653`;
    expect(body.signature).toBe(
      createHmac('sha256', settings.MOMO_SECRET_KEY).update(raw).digest('hex'),
    );
    expect(result.payload.resultCode).toBe('0');
  });
  it('refund: mã khác 0, phản hồi lệch lệnh hoặc thiếu transId đều ném lỗi để lệnh giữ chờ đối soát', async () => {
    echo({ resultCode: 1080 });
    await expect(adapter().refund(refundInput)).rejects.toThrow('mã 1080');
    echo({ requestId: 'other-request' });
    await expect(adapter().refund(refundInput)).rejects.toThrow('không hợp lệ');
    echo({ amount: 1000 });
    await expect(adapter().refund(refundInput)).rejects.toThrow('không hợp lệ');
    const fetch = echo();
    await expect(adapter().refund({ ...refundInput, transactionNo: undefined })).rejects.toThrow(
      'transId',
    );
    await expect(adapter().refund({ ...refundInput, amount: '1000.50' })).rejects.toThrow(
      'số tiền nguyên',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('MOMO_ATM dùng chung Refund API với ví MoMo', () => {
    expect(new MomoAtmAdapter(new ConfigService({ ...settings })).refund).toBeTypeOf('function');
  });
});
