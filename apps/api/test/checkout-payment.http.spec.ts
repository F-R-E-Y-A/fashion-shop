import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { SettlementService } from '../src/modules/checkout/settlement.service.js';
import { InventoryService } from '../src/modules/inventory/index.js';
import { PaymentsService } from '../src/modules/payments/index.js';
import {
  hmac,
  pipeString,
  queryResponseFields,
  queryString,
  vnpDate,
  type VnpParams,
} from '../src/modules/payments/vnpay-signature.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const secret = 'isolated-test-secret-not-a-merchant-credential';
const merchant = 'TESTONLY';
interface View {
  id: string;
  orderCode: string;
  status: string;
  paymentDueAt: string;
  totalAmount: string;
  payments: { reference: string; status: string; checkoutUrl: string; expiresAt: string }[];
}

describe('PH-11 checkout/payment: PostgreSQL + signed fake VNPAY', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let server: Server;
  let gatewayPort: number;
  let token: string;
  let userId: string;
  let addressId: string;
  let variantId: string;
  let queryResult: VnpParams | null = null;
  let tamperQuery = false;
  let dropQuery = false;
  let queryRequests = 0;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = () => t.http.post('/api/checkout/preview').set(auth()).send({ addressId });
  const create = (fingerprint: string, key = randomUUID()) =>
    t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({ addressId, fingerprint, idempotencyKey: key });
  async function place(): Promise<View> {
    const quote = await preview().expect(201);
    return (await create(quote.body.fingerprint).expect(201)).body;
  }
  function signed(order: View, success = true, overrides: VnpParams = {}) {
    const params: VnpParams = {
      vnp_TmnCode: merchant,
      vnp_TxnRef: order.payments[0]!.reference,
      vnp_Amount: String(Number(order.totalAmount) * 100),
      vnp_ResponseCode: success ? '00' : '24',
      vnp_TransactionStatus: success ? '00' : '02',
      vnp_TransactionNo: success ? '123456789' : '0',
      ...overrides,
    };
    return { ...params, vnp_SecureHash: hmac(secret, queryString(params)) };
  }
  const ipn = (params: VnpParams) =>
    t.http
      .get('/api/payments/vnpay/ipn')
      .query(params)
      .expect(200)
      .expect('Cache-Control', 'no-store');
  async function expire(order: View) {
    const past = new Date(Date.now() - 1000);
    await t.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: past } });
    await t.prisma.inventoryReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: past, createdAt: new Date(past.getTime() - 15 * 60_000) },
    });
  }

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      queryRequests++;
      for await (const _chunk of req) {
        /* Consume request before responding. */
      }
      if (dropQuery) {
        req.socket.destroy();
        return;
      }
      if (!queryResult) {
        res.writeHead(503).end();
        return;
      }
      const data: VnpParams = {
        ...queryResult,
        vnp_SecureHash: hmac(secret, pipeString(queryResult, queryResponseFields)),
      };
      if (tamperQuery) data.vnp_Amount = '1';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(data));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    gatewayPort = port;
    t = await createTestApp({
      config: {
        VNPAY_TMN_CODE: merchant,
        VNPAY_HASH_SECRET: secret,
        VNPAY_QUERY_URL: `http://127.0.0.1:${port}/query`,
      },
    });
  });
  beforeEach(async () => {
    queryResult = null;
    tamperQuery = false;
    dropQuery = false;
    queryRequests = 0;
    await resetDatabase(t.prisma);
    const user = await t.prisma.user.create({
      data: { email: 'checkout@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    userId = user.id;
    token = await t.app.get(JwtService).signAsync({ sub: userId, ver: 0 });
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'T01', name: 'Tỉnh thử', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'T0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId,
          administrativeAreaId: commune.id,
          recipientName: 'Khách thử',
          phone: '0901234567',
          detailAddress: 'Địa chỉ kiểm thử',
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('UC-07.1/AC1 preview không giữ hàng; quote 30k ship/discount0, từ 500k freeship', async () => {
    expect((await preview().expect(201)).body).toMatchObject({
      subtotalAmount: '200000.00',
      shippingFeeAmount: '30000.00',
      discountAmount: '0.00',
      totalAmount: '230000.00',
      paymentConfigured: true,
      holdMinutes: 15,
    });
    expect(await t.prisma.inventoryReservation.count()).toBe(0);
    expect(await t.prisma.order.count()).toBe(0);
    await t.http
      .patch(`/api/cart/items/${variantId}`)
      .set(auth())
      .send({ quantity: 3 })
      .expect(200);
    expect((await preview().expect(201)).body.shippingFeeAmount).toBe('0.00');
  });

  it('UC-07.1/AC2 UC-07.3/AC2 login và ownership địa chỉ/đơn, validation UUID, không nhận giá từ client', async () => {
    await t.http.post('/api/checkout/preview').send({ addressId }).expect(401);
    const other = await t.prisma.user.create({
      data: { email: 'other@fixture.test', passwordHash: 'unused', status: 'ACTIVE' },
    });
    await t.prisma.address.update({ where: { id: addressId }, data: { userId: other.id } });
    await preview().expect(404);
    await t.prisma.address.update({ where: { id: addressId }, data: { userId } });
    const order = await place();
    const otherToken = await t.app.get(JwtService).signAsync({ sub: other.id, ver: 0 });
    await t.http
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await t.http
      .get(`/api/orders/by-payment/${order.payments[0]!.reference}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({ addressId: 'bad', fingerprint: 'bad', idempotencyKey: 'bad', totalAmount: '1' })
      .expect(400);
  });

  it('UC-07.1/AC3 quote đổi trả409, không để đơn/hold/payment dở dang', async () => {
    const quote = (await preview()).body;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { salePrice: '150000' },
    });
    expect((await create(quote.fingerprint).expect(409)).body.code).toBe('QUOTE_CHANGED');
    expect(await t.prisma.order.count()).toBe(0);
    expect(await t.prisma.payment.count()).toBe(0);
    expect(await t.prisma.inventoryReservation.count()).toBe(0);
  });

  it('UC-08.1/AC2 thiếu credentials rollback, không giả lập thanh toán trong app', async () => {
    const config = t.app.get(ConfigService);
    const original = config.get.bind(config);
    const quote = (await preview()).body;
    const spy = (await import('vitest')).vi
      .spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'VNPAY_TMN_CODE' ? '' : original(key)));
    try {
      await create(quote.fingerprint).expect(503);
      expect(await t.prisma.order.count()).toBe(0);
      expect(await t.prisma.inventoryReservation.count()).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('UC-07.1/AC4 8 request cùng key tạo đúng một đơn, một hold, một payment; retry không gia hạn', async () => {
    const quote = (await preview()).body;
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => create(quote.fingerprint, key).expect(201)),
    );
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await t.prisma.order.count()).toBe(1);
    expect(await t.prisma.payment.count()).toBe(1);
    expect(await t.prisma.inventoryReservation.count()).toBe(1);
    const order = results[0]!.body as View;
    // Compare actual DB instants, not Prisma's Date roundtrip (which can hide timezone corruption).
    const [clock] = await t.prisma.$queryRaw<
      { seconds: number }[]
    >`SELECT EXTRACT(EPOCH FROM (expires_at - CURRENT_TIMESTAMP))::float8 AS seconds FROM inventory_reservations WHERE order_id=${order.id}::uuid`;
    expect(clock!.seconds).toBeGreaterThan(14 * 60);
    expect(clock!.seconds).toBeLessThanOrEqual(15 * 60);
    const retried = (
      await t.http
        .post(`/api/orders/${order.id}/payments`)
        .set(auth())
        .send({ idempotencyKey: randomUUID() })
        .expect(201)
    ).body;
    expect(retried.paymentDueAt).toBe(order.paymentDueAt);
    expect(retried.payments).toEqual(order.payments);
    const url = new URL(order.payments[0]!.checkoutUrl);
    expect(url.searchParams.get('vnp_Amount')).toBe('23000000');
    expect(await t.prisma.stockMovement.count()).toBe(0);
  });

  it('UC-07.1/AC5 hai khách tranh đơn vị cuối chỉ một người giữ được', async () => {
    await t.prisma.inventory.update({
      where: { productVariantId: variantId },
      data: { quantityOnHand: 1 },
    });
    const a = (await preview()).body;
    const other = await t.prisma.user.create({
      data: { email: 'racer@fixture.test', passwordHash: 'unused', status: 'ACTIVE' },
    });
    const otherToken = await t.app.get(JwtService).signAsync({ sub: other.id, ver: 0 });
    const otherAddress = await t.prisma.address.create({
      data: {
        userId: other.id,
        administrativeAreaId: (
          await t.prisma.address.findUniqueOrThrow({ where: { id: addressId } })
        ).administrativeAreaId,
        recipientName: 'Khách hai',
        phone: '0901234567',
        detailAddress: 'Fixture',
      },
    });
    await t.http
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ variantId, quantity: 1 })
      .expect(201);
    const b = (
      await t.http
        .post('/api/checkout/preview')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ addressId: otherAddress.id })
        .expect(201)
    ).body;
    const results = await Promise.all([
      create(a.fingerprint),
      t.http.post('/api/checkout/orders').set('Authorization', `Bearer ${otherToken}`).send({
        addressId: otherAddress.id,
        fingerprint: b.fingerprint,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await t.prisma.inventoryReservation.count()).toBe(1);
    expect(await t.prisma.order.count()).toBe(1);
  });

  it('UC-08.2/AC1,AC2,AC3 IPN sai chữ ký/tiền bị chặn; callback lặp chỉ thu/trừ kho một lần và giữ số lượng thêm mới', async () => {
    const order = await place();
    const valid = signed(order);
    expect((await ipn({ ...valid, vnp_Amount: '1' })).body.RspCode).toBe('97');
    expect((await ipn(signed(order, true, { vnp_Amount: '100' }))).body.RspCode).toBe('04');
    expect((await ipn(signed(order, true, { vnp_TmnCode: 'WRONG' }))).body.RspCode).toBe('04');
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 2 }).expect(201);
    const results = await Promise.all(Array.from({ length: 6 }, () => ipn(valid)));
    expect(results.filter((r) => r.body.RspCode === '00')).toHaveLength(1);
    expect(await t.prisma.paymentTransaction.count()).toBe(1);
    expect(await t.prisma.stockMovement.count()).toBe(1);
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(9);
    expect((await t.prisma.cartItem.findFirstOrThrow()).quantity).toBe(2);
    expect((await t.http.get(`/api/orders/${order.id}`).set(auth()).expect(200)).body.status).toBe(
      'CONFIRMED',
    );
    await ipn(signed(order, false));
    expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('SUCCEEDED');
  });

  it('UC-08.1/AC3 thất bại cho retry cùng deadline; pending/timeout không mở attempt mới', async () => {
    const order = await place();
    await ipn(signed(order, false));
    const retry = (
      await t.http
        .post(`/api/orders/${order.id}/payments`)
        .set(auth())
        .send({ idempotencyKey: randomUUID() })
        .expect(201)
    ).body as View;
    expect(retry.payments).toHaveLength(2);
    expect(retry.paymentDueAt).toBe(order.paymentDueAt);
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
    await t.http
      .post(`/api/orders/${order.id}/payments`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
    expect(await t.prisma.payment.count()).toBe(2);
  });

  it('UC-08.2/AC7 hết hạn worker nhả hàng; IPN muộn nhận tiền nhưng không bán vượt tồn', async () => {
    const order = await place();
    await expire(order);
    await t.app.get(SettlementService).tick();
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CANCELLED',
    );
    expect((await t.prisma.inventoryReservation.findFirstOrThrow()).releasedAt).not.toBeNull();
    await ipn(signed(order));
    expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('SUCCEEDED');
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PAYMENT_REVIEW',
    );
    expect(await t.prisma.stockMovement.count()).toBe(0);
    expect(await t.prisma.cartItem.count()).toBe(1);
    expect((await t.prisma.inventory.findFirstOrThrow()).quantityOnHand).toBe(10);
  });

  it('UC-07.4/AC1 hủy nhả hold, callback sau hủy vào đối soát; đơn đã thanh toán không được hủy', async () => {
    const order = await place();
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201);
    await ipn(signed(order));
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PAYMENT_REVIEW',
    );
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(409);
  });

  it('UC-07.4/AC2 hủy đơn giữ đơn vị cuối thì món được chọn lại trong giỏ, đặt lại được ngay', async () => {
    await t.prisma.inventory.update({
      where: { productVariantId: variantId },
      data: { quantityOnHand: 1 },
    });
    const order = await place();
    // Trong luc giu hang, gio doc thay het hang va bo chon mon cua chinh khach.
    const held = (await t.http.get('/api/cart').set(auth()).expect(200)).body;
    expect(held.items[0]).toMatchObject({ availability: 'OUT_OF_STOCK', isSelected: false });
    const blocked = await preview().expect(409);
    expect(blocked.body.code).toBe('PENDING_ORDER_EXISTS');
    expect(blocked.body.message).toContain(order.orderCode);
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201);
    const cart = (await t.http.get('/api/cart').set(auth()).expect(200)).body;
    expect(cart.items[0]).toMatchObject({ availability: 'AVAILABLE', isSelected: true });
    expect((await preview().expect(201)).body.pendingOrder).toBeNull();
  });

  it('UC-08.2/AC6 VNPAY không query nền sớm hoặc query lặp trong giới hạn 5 phút', async () => {
    const order = await place();
    expect(
      (await t.app.get(PaymentsService).candidates()).some(
        (p) => p.reference === order.payments[0]!.reference,
      ),
    ).toBe(false);
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(queryRequests).toBe(1);
    await t.prisma.payment.updateMany({ data: { lastCheckedAt: new Date(Date.now() - 90_000) } });
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(queryRequests).toBe(1);
    await t.prisma.payment.updateMany({ data: { lastCheckedAt: new Date(Date.now() - 306_000) } });
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(queryRequests).toBe(2);
  });

  it('UC-08.1/AC7 QueryDR giao dịch hủy11 cho thử lại cùng đơn/deadline, không trừ kho', async () => {
    const order = await place();
    queryResult = {
      ...signed(order, false),
      vnp_ResponseId: 'cancelledQuery',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '11',
      vnp_Message: 'QueryDR success',
      vnp_TransactionType: '01',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '',
    };
    const cancelled = await t.http
      .post(`/api/orders/${order.id}/reconcile`)
      .set(auth())
      .expect(201);
    expect(cancelled.body.payments[0].status).toBe('FAILED');
    expect(await t.prisma.stockMovement.count()).toBe(0);
    const retried = await t.http
      .post(`/api/orders/${order.id}/payments`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(201);
    expect(retried.body.id).toBe(order.id);
    expect(retried.body.paymentDueAt).toBe(order.paymentDueAt);
    expect(retried.body.payments[0].reference).not.toBe(order.payments[0]!.reference);
  });

  it('UC-08.2/AC5 mất IPN: query HTTP ký đúng phục hồi sau restart; query giả mạo không chốt đơn', async () => {
    const order = await place();
    queryResult = {
      ...signed(order),
      vnp_ResponseId: 'response1',
      vnp_Command: 'querydr',
      vnp_Message: 'Success',
      vnp_TransactionType: '01',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261018123456',
    };
    tamperQuery = true;
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(await t.prisma.stockMovement.count()).toBe(0);
    tamperQuery = false;
    await t.prisma.payment.updateMany({
      data: { lastCheckedAt: new Date(Date.now() - 306_000) },
    });
    await t.close();
    t = await createTestApp({
      config: {
        VNPAY_TMN_CODE: merchant,
        VNPAY_HASH_SECRET: secret,
        VNPAY_QUERY_URL: `http://127.0.0.1:${gatewayPort}/query`,
      },
    });
    await t.app.get(SettlementService).tick();
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await t.prisma.stockMovement.count()).toBe(1);
  });

  it('UC-08.1/AC5 return URL giả success chỉ đọc trạng thái, không có nghiệp vụ nhận tiền', async () => {
    const order = await place();
    const response = await t.http
      .get(`/api/orders/by-payment/${order.payments[0]!.reference}?vnp_ResponseCode=00`)
      .set(auth())
      .expect(200);
    expect(response.body.status).toBe('PENDING_PAYMENT');
    expect(await t.prisma.stockMovement.count()).toBe(0);
  });

  it('UC-08.2/AC4 lỗi sau trừ kho rollback cả tiền/đơn/hold/giỏ, callback retry xử lý được', async () => {
    const order = await place();
    const inventory = t.app.get(InventoryService);
    const commit = inventory.commit.bind(inventory);
    const fault = vi.spyOn(inventory, 'commit').mockImplementationOnce(async (...args) => {
      await commit(...args);
      throw new Error('Injected failure after stock write');
    });
    try {
      expect((await ipn(signed(order))).body.RspCode).toBe('99');
      expect(await t.prisma.paymentTransaction.count()).toBe(0);
      expect(await t.prisma.stockMovement.count()).toBe(0);
      expect((await t.prisma.payment.findFirstOrThrow()).status).toBe('PENDING');
      expect((await t.prisma.order.findFirstOrThrow()).status).toBe('PENDING_PAYMENT');
      expect((await t.prisma.inventory.findFirstOrThrow()).quantityOnHand).toBe(10);
      expect((await t.prisma.inventoryReservation.findFirstOrThrow()).releasedAt).toBeNull();
      expect(await t.prisma.cartItem.count()).toBe(1);
    } finally {
      fault.mockRestore();
    }
    expect((await ipn(signed(order))).body.RspCode).toBe('00');
    expect(await t.prisma.stockMovement.count()).toBe(1);
  });

  it('UC-08.2/AC7 hai attempt cùng nhận tiền ghi đủ giao dịch nhưng không trừ kho hai lần', async () => {
    const first = await place();
    await ipn(signed(first, false));
    const second = (
      await t.http
        .post(`/api/orders/${first.id}/payments`)
        .set(auth())
        .send({ idempotencyKey: randomUUID() })
        .expect(201)
    ).body as View;
    await ipn(signed(second, true, { vnp_TransactionNo: '22222222' }));
    await ipn(signed(first, true, { vnp_TransactionNo: '11111111' }));
    expect(await t.prisma.payment.count({ where: { status: 'SUCCEEDED' } })).toBe(2);
    expect(await t.prisma.stockMovement.count()).toBe(1);
    expect((await t.prisma.order.findFirstOrThrow()).status).toBe('PAYMENT_REVIEW');
    expect((await t.prisma.inventory.findFirstOrThrow()).quantityOnHand).toBe(9);
  });

  it('UC-08.1/AC4 link cổng hết hạn trước hold 3 phút; retry sát hạn bị từ chối, không mở attempt', async () => {
    const order = await place();
    const payment = order.payments[0]!;
    const gatewayDeadline = new Date(Date.parse(order.paymentDueAt) - 3 * 60_000);
    expect(payment.expiresAt).toBe(gatewayDeadline.toISOString());
    expect(new URL(payment.checkoutUrl).searchParams.get('vnp_ExpireDate')).toBe(
      vnpDate(gatewayDeadline),
    );
    expect((await preview().expect(201)).body).toMatchObject({ holdMinutes: 15, payMinutes: 12 });

    await ipn(signed(order, false));
    const soon = new Date(Date.now() + 3.5 * 60_000);
    await t.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: soon } });
    await t.prisma.inventoryReservation.updateMany({
      where: { orderId: order.id },
      data: { expiresAt: soon },
    });
    await t.http
      .post(`/api/orders/${order.id}/payments`)
      .set(auth())
      .send({ idempotencyKey: randomUUID() })
      .expect(409);
    expect(await t.prisma.payment.count()).toBe(1);
  });

  it('UC-07.1/AC6 mỗi khách một đơn chờ: đơn khác nội dung bị chặn, preview chỉ ra đơn chờ; hủy rồi đặt được', async () => {
    const quote = (await preview().expect(201)).body;
    expect(quote.pendingOrder).toBeNull();
    const racing = await Promise.all(
      Array.from({ length: 5 }, () => create(quote.fingerprint).expect(201)),
    );
    expect(new Set(racing.map((r) => r.body.id)).size).toBe(1);
    const order = racing[0]!.body as View;
    expect((await preview().expect(201)).body.pendingOrder).toEqual({
      id: order.id,
      orderCode: expect.any(String),
    });

    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 1 }).expect(201);
    const changed = (await preview().expect(201)).body;
    expect(changed.fingerprint).not.toBe(quote.fingerprint);
    const blocked = await create(changed.fingerprint).expect(409);
    expect(blocked.body.code).toBe('PENDING_ORDER_EXISTS');
    expect(await t.prisma.order.count()).toBe(1);
    expect(await t.prisma.inventoryReservation.count({ where: { releasedAt: null } })).toBe(1);

    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201);
    const fresh = (await preview().expect(201)).body;
    expect(fresh.pendingOrder).toBeNull();
    const next = (await create(fresh.fingerprint).expect(201)).body as View;
    expect(next.id).not.toBe(order.id);
    expect(next.status).toBe('PENDING_PAYMENT');
  });

  it('UC-08.2/AC6 QueryDR mất kết nối không chiếm cả lượt 5 phút: lùi 30 giây rồi chốt được', async () => {
    const order = await place();
    queryResult = {
      ...signed(order),
      vnp_ResponseId: 'response-drop',
      vnp_Command: 'querydr',
      vnp_Message: 'Success',
      vnp_TransactionType: '01',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261019134918',
    };
    dropQuery = true;
    await t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).expect(201);
    expect(queryRequests).toBe(1);
    const [lag] = await t.prisma.$queryRaw<
      { seconds: number }[]
    >`SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_checked_at))::float8 AS seconds FROM payments`;
    expect(lag!.seconds).toBeGreaterThan(305 - 31);
    expect(lag!.seconds).toBeLessThan(305 - 28);

    dropQuery = false;
    await t.prisma
      .$executeRaw`UPDATE payments SET last_checked_at = last_checked_at - interval '35 seconds'`;
    await t.app.get(SettlementService).tick();
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CONFIRMED',
    );
    expect(await t.prisma.stockMovement.count()).toBe(1);
  });

  /**
   * Trang ket qua gui lai toan bo tham so return URL cua cong (settlement.service.ts returnNotice).
   * Day la du lieu khach cam trong tay nen chi tin khi chu ky, merchant, ma tham chieu va so tien
   * deu khop; sai mot thu thi bo qua, de IPN/query quyet dinh nhu cu.
   */
  describe('return URL có chữ ký: POST /orders/:id/reconcile kèm params', () => {
    const back = (order: View, params: VnpParams) =>
      t.http.post(`/api/orders/${order.id}/reconcile`).set(auth()).send({ params }).expect(201);
    const state = async (order: View) => ({
      order: (await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status,
      payment: (await t.prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status,
      moves: await t.prisma.stockMovement.count(),
    });

    it('UC-08.1/AC6 UC-08.2/AC3 chữ ký đúng, thành công: chốt đơn ngay; gửi lại return hoặc IPN không trừ kho lần hai', async () => {
      const order = await place();
      expect((await back(order, signed(order))).body.status).toBe('CONFIRMED');
      expect(await state(order)).toEqual({ order: 'CONFIRMED', payment: 'SUCCEEDED', moves: 1 });

      await back(order, signed(order));
      expect((await ipn(signed(order))).body.RspCode).toBe('02');
      expect(await state(order)).toEqual({ order: 'CONFIRMED', payment: 'SUCCEEDED', moves: 1 });
    });

    it('UC-08.1/AC7 khách hủy trên cổng (mã 24) có chữ ký: đóng lượt thanh toán, đơn vẫn giữ để thử lại', async () => {
      const order = await place();
      await back(order, signed(order, false));
      expect(await state(order)).toEqual({ order: 'PENDING_PAYMENT', payment: 'FAILED', moves: 0 });
    });

    it.each<[string, (order: View) => VnpParams]>([
      ['sửa số tiền sau khi ký', (order) => ({ ...signed(order), vnp_Amount: '100' })],
      ['ký đúng nhưng số tiền khác đơn', (order) => signed(order, true, { vnp_Amount: '100' })],
      [
        'ký đúng nhưng mã tham chiếu của giao dịch khác',
        (order) => signed(order, true, { vnp_TxnRef: 'GIAO-DICH-KHAC' }),
      ],
      ['ký đúng nhưng merchant khác', (order) => signed(order, true, { vnp_TmnCode: 'KHAC' })],
      // Nhanh that bai khong di qua settle(), nen chi buoc matches() cua returnNotice chan duoc.
      [
        'hủy trên cổng, ký đúng nhưng số tiền khác đơn',
        (order) => signed(order, false, { vnp_Amount: '100' }),
      ],
      [
        'hủy trên cổng, ký đúng nhưng merchant khác',
        (order) => signed(order, false, { vnp_TmnCode: 'KHAC' }),
      ],
      [
        'ký bằng khoá khác',
        (order) => {
          const { vnp_SecureHash: _ignored, ...params } = signed(order);
          return { ...params, vnp_SecureHash: hmac('khoa-gia-mao', queryString(params)) };
        },
      ],
    ])('UC-08.1/AC8 %s: không nhận tiền, không trừ kho, đơn giữ nguyên', async (_case, build) => {
      const order = await place();
      const before = await state(order);
      await back(order, build(order));
      expect(await state(order)).toEqual(before);
      expect(before).toMatchObject({ order: 'PENDING_PAYMENT', moves: 0 });
    });
  });
});
