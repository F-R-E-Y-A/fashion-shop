import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { SettlementService } from '../src/modules/checkout/settlement.service.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const secret = 'momo-http-fixture-not-a-merchant-key';
const access = 'fixture-access';
const partner = 'FIXTUREPARTNER';
interface View {
  id: string;
  totalAmount: string;
  status: string;
  paymentDueAt: string;
  payments: {
    id: string;
    reference: string;
    gateway: string;
    status: string;
    checkoutUrl: string | null;
  }[];
}
function signed(order: View, overrides: Record<string, string | number> = {}) {
  const data = {
    partnerCode: partner,
    orderId: order.payments[0]!.reference,
    requestId: order.payments[0]!.reference,
    amount: Number(order.totalAmount),
    orderInfo: 'Fixture payment',
    orderType: 'momo_wallet',
    payType: 'qr',
    transId: 12345678,
    responseTime: Date.now(),
    resultCode: 0,
    message: 'Successful.',
    extraData: '',
    ...overrides,
  };
  const raw = `accessKey=${access}&amount=${data.amount}&extraData=${data.extraData}&message=${data.message}&orderId=${data.orderId}&orderInfo=${data.orderInfo}&orderType=${data.orderType}&partnerCode=${data.partnerCode}&payType=${data.payType}&requestId=${data.requestId}&responseTime=${data.responseTime}&resultCode=${data.resultCode}&transId=${data.transId}`;
  return { ...data, signature: createHmac('sha256', secret).update(raw).digest('hex') };
}

describe('PH-11 MoMo: HTTP gateway outside PostgreSQL transaction', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let server: Server;
  let port: number;
  let token: string;
  let addressId: string;
  let variantId: string;
  let failCreate = false;
  let queryState = 1000;
  let committedAtGateway = false;
  const creates: Record<string, unknown>[] = [];
  const refunds: Record<string, unknown>[] = [];
  let refundState = 0;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = () => t.http.post('/api/checkout/preview').set(auth()).send({ addressId });
  const post = (fingerprint: string, idempotencyKey = randomUUID(), gateway = 'MOMO') =>
    t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({ addressId, fingerprint, idempotencyKey, gateway });
  async function place(): Promise<View> {
    const quote = await preview().expect(201);
    return (await post(quote.body.fingerprint).expect(201)).body;
  }
  const ipn = (data: Record<string, unknown>) => t.http.post('/api/payments/momo/ipn').send(data);
  async function unlockQuery(order: View) {
    await t.prisma.payment.update({
      where: { id: order.payments[0]!.id },
      data: { lastCheckedAt: new Date(Date.now() - 61000) },
    });
  }
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      const data = JSON.parse(body) as Record<string, string | number>;
      res.setHeader('content-type', 'application/json');
      if (req.url === '/create') {
        creates.push(data);
        const payment = await t.prisma.payment.findUnique({
          where: { reference: String(data.orderId) },
        });
        committedAtGateway =
          !!payment &&
          (await t.prisma.inventoryReservation.count({
            where: { orderId: payment.orderId, releasedAt: null, expiresAt: { gt: new Date() } },
          })) === 1;
        if (failCreate) {
          failCreate = false;
          res.writeHead(503).end();
          return;
        }
        res.end(
          JSON.stringify({
            partnerCode: partner,
            orderId: data.orderId,
            requestId: data.requestId,
            amount: data.amount,
            resultCode: 0,
            payUrl: `http://127.0.0.1:${port}/pay?ref=${data.orderId}`,
          }),
        );
      } else if (req.url === '/refund') {
        refunds.push(data);
        res.end(
          JSON.stringify({
            partnerCode: partner,
            orderId: data.orderId,
            requestId: data.requestId,
            amount: data.amount,
            transId: 99887766,
            resultCode: refundState,
            message: 'refund',
            responseTime: Date.now(),
          }),
        );
      } else {
        res.end(
          JSON.stringify({
            partnerCode: partner,
            orderId: data.orderId,
            requestId: data.requestId,
            amount: 230000,
            resultCode: queryState,
            transId: 12345678,
            message: 'query',
            responseTime: Date.now(),
          }),
        );
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    t = await createTestApp({
      config: {
        MOMO_PARTNER_CODE: partner,
        MOMO_ACCESS_KEY: access,
        MOMO_SECRET_KEY: secret,
        MOMO_API_URL: `http://127.0.0.1:${port}`,
        MOMO_IPN_URL: 'https://fixture.test/api/payments/momo/ipn',
        MOMO_RETURN_URL: 'https://fixture.test/thanh-toan/ket-qua',
        VNPAY_TMN_CODE: 'TESTVNP',
        VNPAY_HASH_SECRET: 'test-vnpay-only',
      },
    });
    await t.resetRateLimits();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    creates.length = 0;
    refunds.length = 0;
    refundState = 0;
    failCreate = false;
    queryState = 1000;
    committedAtGateway = false;
    const user = await t.prisma.user.create({
      data: { email: 'momo@fixture.test', passwordHash: 'unused', status: 'ACTIVE' },
    });
    token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: 0 });
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'M01', name: 'Tỉnh kiểm thử', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'M0101', name: 'Phường kiểm thử', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId: user.id,
          administrativeAreaId: commune.id,
          recipientName: 'Khách thử',
          phone: '0901234567',
          detailAddress: 'Địa chỉ fixture',
          isDefault: true,
        },
      })
    ).id;
    await seedShipping(t.prisma);
    variantId = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '200000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 10 } });
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 1 }).expect(201);
  });
  afterAll(async () => {
    await t?.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('UC-08.1/AC1 exposes both gateways, commits hold before network and reuses the same order/request', async () => {
    const quote = await preview().expect(201);
    expect(quote.body.gateways).toEqual(
      expect.arrayContaining([
        { code: 'VNPAY', label: 'VNPAY', configured: true },
        { code: 'MOMO', label: 'MoMo', configured: true },
      ]),
    );
    const key = randomUUID();
    const order: View = (await post(quote.body.fingerprint, key).expect(201)).body;
    expect(committedAtGateway).toBe(true);
    expect(order.payments[0]).toMatchObject({
      gateway: 'MOMO',
      status: 'PENDING',
      checkoutUrl: expect.stringContaining('/pay?ref='),
    });
    expect((await post(quote.body.fingerprint, key).expect(201)).body.id).toBe(order.id);
    expect(creates).toHaveLength(1);
    expect(await t.prisma.payment.count()).toBe(1);
    await post(quote.body.fingerprint, randomUUID(), 'VNPAY').expect(409);
  });
  it('UC-08.1/AC2 missing MoMo credentials rolls back the order and hold', async () => {
    const config = t.app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = vi
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'MOMO_SECRET_KEY' ? '' : original(key)));
    try {
      const quote = await preview().expect(201);
      await post(quote.body.fingerprint).expect(503);
      expect(await t.prisma.order.count()).toBe(0);
      expect(await t.prisma.inventoryReservation.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
  it('UC-08.2/AC1,AC2 signed IPN commits stock/cart once; tampering, wrong amount and wrong gateway cannot settle', async () => {
    const order = await place();
    await ipn({ ...signed(order), amount: 1 }).expect(400);
    await ipn(signed(order, { amount: 1 })).expect(400);
    await ipn(signed(order, { partnerCode: 'OTHER' })).expect(400);
    await ipn(signed(order, { resultCode: 9000 })).expect(204);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
    await ipn(signed(order)).expect(204).expect('Cache-Control', 'no-store');
    await ipn(signed(order)).expect(204);
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(9);
    expect(await t.prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(1);
    expect(await t.prisma.cartItem.count()).toBe(0);
    expect(await t.prisma.paymentTransaction.count({ where: { status: 'PROCESSED' } })).toBe(1);
  });
  it('UC-08.2/AC4 lỗi khi chốt IPN trả 503 để MoMo gửi lại, không ghi gì; lần gửi lại chốt đúng một lần', async () => {
    const order = await place();
    const settlement = t.app.get(SettlementService);
    const log = vi.spyOn(settlement['logger'], 'error').mockImplementation(() => undefined);
    const spy = vi.spyOn(settlement, 'settle').mockRejectedValueOnce(new Error('mat ket noi CSDL'));
    try {
      await ipn(signed(order)).expect(503);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]![0])).not.toContain('mat ket noi CSDL');
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
    expect(await t.prisma.stockMovement.count()).toBe(0);

    await ipn(signed(order)).expect(204);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await t.prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(1);
  });
  it('UC-08.1/AC9 an uncertain create is retried with the persisted payload even after callback configuration changes', async () => {
    failCreate = true;
    const order = await place();
    expect(order.payments[0]!.checkoutUrl).toBeNull();
    expect(
      await t.prisma.inventoryReservation.count({
        where: { releasedAt: null, expiresAt: { gt: new Date() } },
      }),
    ).toBe(1);
    await unlockQuery(order);
    const config = t.app.get(ConfigService);
    const original = config.get.bind(config);
    const spy = vi
      .spyOn(config, 'get')
      .mockImplementation((key: string) =>
        key === 'MOMO_RETURN_URL' ? 'https://changed.fixture.test/return' : original(key),
      );
    try {
      const retry = await t.http
        .post(`/api/orders/${order.id}/payments`)
        .set(auth())
        .send({ idempotencyKey: randomUUID() })
        .expect(201);
      expect(retry.body.paymentDueAt).toBe(order.paymentDueAt);
      expect(retry.body.payments[0].checkoutUrl).toContain('/pay?ref=');
      expect(creates[1]).toEqual(creates[0]);
      expect(await t.prisma.payment.count()).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
  it('UC-08.2/AC3,AC5 query recovers a missing IPN and a later IPN does not sell twice', async () => {
    const order = await place();
    queryState = 0;
    await unlockQuery(order);
    const result = await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(result.body.status).toBe('CONFIRMED');
    await ipn(signed(order)).expect(204);
    expect(await t.prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(1);
  });
  it('UC-08.1/AC3 a failed attempt can retry without extending the reservation deadline', async () => {
    const order = await place();
    await ipn(signed(order, { resultCode: 1006, transId: 0 })).expect(204);
    const retry = await t.http
      .post(`/api/orders/${order.id}/payments`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
    expect(retry.body.paymentDueAt).toBe(order.paymentDueAt);
    expect(retry.body.payments).toHaveLength(2);
    expect(retry.body.payments[0].gateway).toBe('MOMO');
    expect(retry.body.payments[0].checkoutUrl).toContain('/pay?ref=');
  });
  it('UC-07.4/AC1 UC-08.2/AC7 cancel/expiry releases stock; late paid money goes to PAYMENT_REVIEW', async () => {
    const order = await place();
    const past = new Date(Date.now() - 1000);
    await t.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: past } });
    await t.prisma.inventoryReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: past, createdAt: new Date(past.getTime() - 900000) },
    });
    await t.app.get(SettlementService).tick();
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CANCELLED',
    );
    await ipn(signed(order)).expect(204);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PAYMENT_REVIEW',
    );
    expect(await t.prisma.stockMovement.count({ where: { movementType: 'SALE' } })).toBe(0);
  });
  it('UC-07.4/AC4 khách hủy đơn đã trả MoMo: trả kho, hoàn theo transId lúc thu, đơn REFUNDED', async () => {
    const order = await place();
    await ipn(signed(order)).expect(204);
    const after = (await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201))
      .body as View & { refundPending: boolean };
    expect(after.status).toBe('REFUNDED');
    expect(after.refundPending).toBe(false);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ partnerCode: partner, amount: 230000, transId: 12345678 });
    expect(refunds[0]!.orderId).not.toBe(order.payments[0]!.reference);
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(10);
  });
  it('UC-07.4/AC5 MoMo từ chối hoàn: đơn vẫn hủy, lệnh hoàn giữ chờ admin, không hoàn lần hai khi bấm lại', async () => {
    refundState = 1080;
    const order = await place();
    await ipn(signed(order)).expect(204);
    const after = (await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201))
      .body as View & { refundPending: boolean };
    expect(after.status).toBe('CANCELLED');
    expect(after.refundPending).toBe(true);
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201);
    expect(refunds).toHaveLength(1);
  });
});
