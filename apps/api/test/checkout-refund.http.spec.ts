import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import type { Env } from '../src/infra/config/env.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import {
  hmac,
  pipeString,
  refundResponseFields,
  type VnpParams,
} from '../src/modules/payments/vnpay-signature.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const secret = 'isolated-test-secret-not-a-merchant-credential';
const merchant = 'TESTONLY';
type Mode = 'ok' | 'drop' | 'reject';

describe('PH-11 hoàn tiền: khoá đơn, sổ hoàn và đối soát tay (PostgreSQL + cổng VNPAY giả)', () => {
  let t: TestApp;
  let server: Server;
  let token: string;
  let adminToken: string;
  let addressId: string;
  let mode: Mode = 'ok';
  let delayMs = 0;
  let sent: VnpParams[] = [];
  const as = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });
  const refund = (paymentId: string, body: { amount?: string; reason?: string } = {}) =>
    t.http.post(`/api/admin/payments/${paymentId}/refund`).set(as(adminToken)).send(body);
  const resolve = (paymentId: string, outcome: 'SUCCEEDED' | 'FAILED') =>
    t.http
      .post(`/api/admin/payments/${paymentId}/refund/resolve`)
      .set(as(adminToken))
      .send({ outcome, note: 'Đối chiếu merchant portal trong bài kiểm thử.' });
  const intents = (status?: 'RECEIVED' | 'PROCESSED' | 'FAILED') =>
    t.prisma.paymentTransaction.findMany({
      where: { externalTransactionId: { startsWith: 'REFUND-INTENT:' }, status },
    });
  const ledger = () =>
    t.prisma.paymentTransaction.findMany({
      where: { externalTransactionId: { startsWith: 'REFUND:' } },
    });

  /** Dat don VNPAY qua API that roi danh dau da thu tien: refund chi can trang thai sau IPN. */
  async function paidOrder() {
    const quote = (
      await t.http.post('/api/checkout/preview').set(as(token)).send({ addressId }).expect(201)
    ).body;
    const order = (
      await t.http
        .post('/api/checkout/orders')
        .set(as(token))
        .send({ addressId, fingerprint: quote.fingerprint, idempotencyKey: randomUUID() })
        .expect(201)
    ).body as { id: string; payments: { id: string }[] };
    const paymentId = order.payments[0]!.id;
    await t.prisma.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED' } });
    await t.prisma.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED' } });
    return { orderId: order.id, paymentId };
  }
  const orderStatus = async (id: string) =>
    (await t.prisma.order.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      const request = JSON.parse(body) as VnpParams;
      sent.push(request);
      if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
      if (mode === 'drop') {
        req.socket.destroy();
        return;
      }
      const reply: VnpParams = {
        vnp_RequestId: request.vnp_RequestId!,
        vnp_ResponseCode: mode === 'ok' ? '00' : '99',
        vnp_TmnCode: merchant,
        vnp_Amount: request.vnp_Amount!,
        vnp_TxnRef: request.vnp_TxnRef!,
        vnp_TransactionDate: request.vnp_TransactionDate!,
        vnp_TransactionType: request.vnp_TransactionType!,
        vnp_CreateBy: request.vnp_CreateBy!,
        vnp_CreateDate: request.vnp_CreateDate!,
        vnp_IpAddr: request.vnp_IpAddr!,
        vnp_OrderInfo: request.vnp_OrderInfo!,
        vnp_Message: mode === 'ok' ? 'Ok' : 'Loi khac',
      };
      reply.vnp_SecureHash = hmac(secret, pipeString(reply, refundResponseFields));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    t = await createTestApp({
      config: {
        VNPAY_TMN_CODE: merchant,
        VNPAY_HASH_SECRET: secret,
        VNPAY_REFUND_URL: `http://127.0.0.1:${port}/refund`,
      } as Partial<Env>,
    });
  });
  beforeEach(async () => {
    mode = 'ok';
    delayMs = 0;
    sent = [];
    await resetDatabase(t.prisma);
    const jwt = t.app.get(JwtService);
    const customer = await t.prisma.user.create({
      data: { email: 'refund-buyer@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    token = await jwt.signAsync({ sub: customer.id, ver: 0 });
    const admin = await t.prisma.user.create({
      data: { email: 'refund-admin@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    expect((await grantAdminRole(t.prisma, 'refund-admin@fixture.test')).outcome).toBe('GRANTED');
    adminToken = await jwt.signAsync({ sub: admin.id, ver: 0 });
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'T01', name: 'Tỉnh thử', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'T0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId: customer.id,
          administrativeAreaId: commune.id,
          recipientName: 'Khách thử',
          phone: '0901234567',
          detailAddress: 'Địa chỉ kiểm thử',
          isDefault: true,
        },
      })
    ).id;
    await seedShipping(t.prisma);
    const variantId = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } }))
      .id;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '200000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 10 } });
    await t.http
      .post('/api/cart/items')
      .set(as(token))
      .send({ variantId, quantity: 1 })
      .expect(201);
  });
  afterAll(async () => {
    await t?.close();
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('admin bấm hoàn hai lần song song: cổng nhận đúng một lệnh, đơn REFUNDED một lần', async () => {
    const { orderId, paymentId } = await paidOrder();
    delayMs = 300;
    const results = await Promise.all([refund(paymentId), refund(paymentId)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ vnp_Amount: '23000000', vnp_TransactionType: '02' });
    expect(await orderStatus(orderId)).toBe('REFUNDED');
    expect(await ledger()).toHaveLength(1);
    expect(await intents('RECEIVED')).toHaveLength(0);
  });

  it('hoàn một phần hai lần: PARTIALLY_REFUNDED rồi REFUNDED, tổng theo sổ, lần ba 409', async () => {
    const { orderId, paymentId } = await paidOrder();
    await refund(paymentId, { amount: '230000.01' }).expect(409);
    await refund(paymentId, { amount: '100000', reason: 'Thiếu phụ kiện' }).expect(201);
    expect(sent[0]).toMatchObject({ vnp_Amount: '10000000', vnp_TransactionType: '03' });
    expect(await orderStatus(orderId)).toBe('PARTIALLY_REFUNDED');
    await refund(paymentId).expect(201);
    expect(sent[1]).toMatchObject({ vnp_Amount: '13000000' });
    expect(await orderStatus(orderId)).toBe('REFUNDED');
    const rows = await ledger();
    expect(
      rows.map((row) => (row.payload as { refundedAmount: string }).refundedAmount).sort(),
    ).toEqual(['100000.00', '130000.00']);
    expect((await refund(paymentId).expect(409)).body.message).toContain('trạng thái');
    expect(sent).toHaveLength(2);
  });

  it('cổng mất kết nối: giữ lệnh chờ đối soát, chặn lệnh mới; chốt FAILED rồi hoàn lại được', async () => {
    const { orderId, paymentId } = await paidOrder();
    mode = 'drop';
    expect((await refund(paymentId).expect(503)).body.code).toBe('REFUND_PENDING');
    const [pending] = await intents('RECEIVED');
    expect((pending!.payload as { lastError?: string }).lastError).toBeTruthy();
    mode = 'ok';
    expect((await refund(paymentId).expect(409)).body.code).toBe('REFUND_PENDING');
    expect(sent).toHaveLength(1);
    await resolve(paymentId, 'FAILED').expect(201);
    expect(await intents('FAILED')).toHaveLength(1);
    expect(await orderStatus(orderId)).toBe('CONFIRMED');
    await refund(paymentId).expect(201);
    expect(sent).toHaveLength(2);
    expect(await orderStatus(orderId)).toBe('REFUNDED');
  });

  it('cổng trả mã lỗi vẫn giữ chờ đối soát; chốt SUCCEEDED ghi sổ mà không gọi cổng lại', async () => {
    const { orderId, paymentId } = await paidOrder();
    mode = 'reject';
    expect((await refund(paymentId).expect(503)).body.code).toBe('REFUND_PENDING');
    await resolve(paymentId, 'SUCCEEDED').expect(201);
    expect(sent).toHaveLength(1);
    expect(await orderStatus(orderId)).toBe('REFUNDED');
    const [row] = await ledger();
    expect(row!.externalTransactionId).toMatch(/^REFUND:MANUAL:/u);
    expect((row!.payload as { refundedAmount: string }).refundedAmount).toBe('230000.00');
    await resolve(paymentId, 'SUCCEEDED').expect(409);
    await refund(paymentId).expect(409);
  });

  it('không chốt được lệnh đang chờ cổng; lệnh treo quá hạn (process sập giữa chừng) thì chốt được', async () => {
    const { orderId, paymentId } = await paidOrder();
    delayMs = 1500;
    const inFlight = refund(paymentId).then((response) => response);
    while (!(await intents('RECEIVED')).length) await new Promise((done) => setTimeout(done, 50));
    expect((await resolve(paymentId, 'FAILED').expect(409)).body.code).toBe('REFUND_IN_FLIGHT');
    expect((await inFlight).status).toBe(201);
    expect(await orderStatus(orderId)).toBe('REFUNDED');
    expect(await intents('FAILED')).toHaveLength(0);

    const second = await paidOrder();
    await t.prisma.paymentTransaction.create({
      data: {
        paymentId: second.paymentId,
        gateway: 'VNPAY',
        externalTransactionId: `REFUND-INTENT:${randomUUID()}`,
        status: 'RECEIVED',
        payload: { amount: '230000.00', actor: 'crashed', reason: null, full: true },
        createdAt: new Date(Date.now() - 120_000),
      },
    });
    await resolve(second.paymentId, 'FAILED').expect(201);
  });

  it('chỉ ADMIN hoàn và chốt; khách gọi bị 403, không tạo lệnh', async () => {
    const { paymentId } = await paidOrder();
    await t.http
      .post(`/api/admin/payments/${paymentId}/refund`)
      .set(as(token))
      .send({})
      .expect(403);
    await t.http
      .post(`/api/admin/payments/${paymentId}/refund/resolve`)
      .set(as(token))
      .send({ outcome: 'FAILED', note: 'x' })
      .expect(403);
    await resolve(paymentId, 'FAILED').expect(409);
    expect(await intents()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
