import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/infra/config/env.js';
import { CheckoutService } from '../src/modules/checkout/index.js';
import {
  hmac,
  pipeString,
  refundResponseFields,
  type VnpParams,
} from '../src/modules/payments/vnpay-signature.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';
import { type Actor, type ReviewWorld, setupReviewWorld } from './helpers/review-flow.js';

const DAY_MS = 86_400_000;
const secret = 'isolated-test-secret-not-a-merchant-credential';
const merchant = 'TESTONLY';
const account = {
  bankName: 'Vietcombank',
  accountNumber: '0123 4567 89',
  accountHolder: 'NGUYEN THI MINH ANH',
};

describe('UC-14.1, UC-14.2 tra hang va hoan tien (PostgreSQL + cong VNPAY gia)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let w: ReviewWorld;
  let server: Server;
  let gateway: 'ok' | 'drop' = 'ok';
  let receiptNo = 15123456;
  /** So lan cong gia nhan lenh hoan: bang chung tien ra khoi cong may lan. */
  let refundCalls = 0;

  const submit = (actor: Actor, orderId: string, body: Record<string, unknown>) =>
    t.http.post(`/api/orders/${orderId}/returns`).set(actor.auth).send(body);
  const admin = (path: string, body: Record<string, unknown> = {}) =>
    t.http.post(`/api/admin/returns/${path}`).set(w.admin.auth).send(body);
  const onHand = async (orderItemId: string) => {
    const { productVariantId } = await t.prisma.orderItem.findUniqueOrThrow({
      where: { id: orderItemId },
    });
    return (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId } }))
      .quantityOnHand;
  };
  const photo = async (actor: Actor) => {
    const ticket = await t.http
      .post('/api/uploads/tickets')
      .set(actor.auth)
      .send({ purpose: 'return' })
      .expect(200);
    storage.put(ticket.body.key as string, {});
    return ticket.body.key as string;
  };
  /** Doi moc giao cua don ve qua khu: lich su DELIVERED la nguon cua han 15 ngay. */
  const deliveredDaysAgo = (orderId: string, days: number) =>
    t.prisma.orderStatusHistory.updateMany({
      where: { orderId, status: 'DELIVERED' },
      data: { createdAt: new Date(Date.now() - days * DAY_MS) },
    });
  /** Don COD da giao, khach gui tra 1 mon ly do co khong vua, ADMIN duyet. */
  const approvedCodReturn = async (quantity = 1) => {
    const placed = await w.deliveredItem(quantity);
    const created = await submit(w.buyer, placed.orderId, {
      items: [{ orderItemId: placed.orderItemId, quantity }],
      reasonCode: 'SIZE_MISMATCH',
      refundAccount: account,
    }).expect(201);
    await admin(`${created.body.id}/approve`, { note: 'Gửi hàng về kho Q1.' }).expect(200);
    return { ...placed, returnId: created.body.id as string };
  };

  /** Yeu cau tra 1 mon cua don VNPAY, da duyet va da nhan hang: san sang hoan tien. */
  const receivedVnpayReturn = async () => {
    await w.deliveredItem();
    const order = await deliveredVnpayOrder();
    const created = await submit(w.buyer, order.orderId, {
      items: [{ orderItemId: order.orderItemId, quantity: 1 }],
      reasonCode: 'SIZE_MISMATCH',
    }).expect(201);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/receive`).expect(200);
    return { ...order, returnId: created.body.id as string };
  };
  /**
   * Giu khoa don bang chinh withOrder cua app cho toi khi goi ham tra ve. Request gui trong luc do
   * xep hang sau khoa theo thu tu den, nen test chon duoc thao tac nao chay truoc, thao tac nao chen
   * vao giua hai transaction cua thao tac kia (Promise.all tran khong ep duoc thu tu nay).
   */
  const holdOrder = async (orderId: string) => {
    let release!: () => void;
    let held!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const locked = new Promise<void>((done) => (held = done));
    const closed = t.app.get(CheckoutService).withOrder(orderId, w.buyer.id, async () => {
      held();
      await gate;
    });
    await locked;
    return async () => {
      release();
      await closed;
    };
  };
  /** Cho toi khi du `count` ket noi dang cho khoa trong DB test: request da thuc su xep hang. */
  const queued = async (count: number) => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await t.prisma.$queryRaw<{ waiting: bigint }[]>`
        SELECT count(*) AS waiting FROM pg_locks
        WHERE NOT granted
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
      if (Number(row!.waiting) >= count) return;
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error(`Khong du ${count} request cho khoa don.`);
  };
  /**
   * Chan moi lenh GHI vao so cong (payment_transactions) cho toi khi goi ham tra ve; lenh DOC van
   * chay. Hai request song song vi vay cung qua buoc kiem tra trung roi moi cung ghi: dung thu tu
   * xau nhat cua hai transaction READ COMMITTED.
   */
  const holdLedgerWrites = async () => {
    let release!: () => void;
    let held!: () => void;
    const gate = new Promise<void>((done) => (release = done));
    const locked = new Promise<void>((done) => (held = done));
    const closed = t.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE payment_transactions IN SHARE MODE`;
        held();
        await gate;
      },
      { timeout: 15_000 },
    );
    await locked;
    return async () => {
      release();
      await closed;
    };
  };
  const refundedAmounts = async (paymentId: string) =>
    (
      await t.prisma.paymentTransaction.findMany({
        where: { paymentId, externalTransactionId: { startsWith: 'REFUND:' } },
      })
    ).map((row) => (row.payload as { refundedAmount: string }).refundedAmount);

  /** Don VNPAY that qua API, danh dau da thu tien roi giao xong qua duong ADMIN. */
  const deliveredVnpayOrder = async () => {
    const { productVariantId } = await t.prisma.orderItem.findFirstOrThrow({
      where: { order: { userId: w.buyer.id } },
    });
    const addressId = (await t.prisma.address.findFirstOrThrow({ where: { userId: w.buyer.id } }))
      .id;
    await t.http
      .post('/api/cart/items')
      .set(w.buyer.auth)
      .send({ variantId: productVariantId, quantity: 2 })
      .expect(201);
    const quote = await t.http
      .post('/api/checkout/preview')
      .set(w.buyer.auth)
      .send({ addressId })
      .expect(201);
    const order = await t.http
      .post('/api/checkout/orders')
      .set(w.buyer.auth)
      .send({ addressId, fingerprint: quote.body.fingerprint, idempotencyKey: randomUUID() })
      .expect(201);
    const paymentId = order.body.payments[0].id as string;
    await t.prisma.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED' } });
    await t.prisma.paymentTransaction.create({
      data: {
        paymentId,
        gateway: 'VNPAY',
        externalTransactionId: String(receiptNo++),
        status: 'PROCESSED',
        payload: {},
      },
    });
    await t.prisma.order.update({ where: { id: order.body.id }, data: { status: 'CONFIRMED' } });
    const adminOrder = (path: string) =>
      t.http.post(`/api/admin/orders/${order.body.id}/${path}`).set(w.admin.auth).send({});
    await adminOrder('start-processing').expect(201);
    await adminOrder('delivered').expect(201);
    const orderItemId = (
      await t.prisma.orderItem.findFirstOrThrow({ where: { orderId: order.body.id } })
    ).id;
    return { orderId: order.body.id as string, orderItemId, paymentId };
  };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += String(chunk);
      const request = JSON.parse(body) as VnpParams;
      if (gateway === 'drop') {
        req.socket.destroy();
        return;
      }
      refundCalls += 1;
      const reply: VnpParams = {
        vnp_ResponseId: randomUUID().replaceAll('-', ''),
        vnp_Command: 'refund',
        vnp_ResponseCode: '00',
        vnp_Message: 'Refund success',
        vnp_TmnCode: merchant,
        vnp_TxnRef: request.vnp_TxnRef!,
        vnp_Amount: request.vnp_Amount!,
        vnp_BankCode: 'NCB',
        vnp_PayDate: request.vnp_CreateDate!,
        vnp_TransactionNo: request.vnp_TransactionNo ?? '',
        vnp_TransactionType: request.vnp_TransactionType!,
        vnp_TransactionStatus: '05',
        vnp_OrderInfo: request.vnp_OrderInfo!,
      };
      reply.vnp_SecureHash = hmac(secret, pipeString(reply, refundResponseFields));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(reply));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    t = await createTestApp({
      imageStorage: storage,
      config: {
        VNPAY_TMN_CODE: merchant,
        VNPAY_HASH_SECRET: secret,
        VNPAY_REFUND_URL: `http://127.0.0.1:${port}/refund`,
      } as Partial<Env>,
    });
  });
  beforeEach(async () => {
    gateway = 'ok';
    refundCalls = 0;
    storage.reset();
    w = await setupReviewWorld(t);
  });
  afterAll(async () => {
    await t?.close();
    await new Promise<void>((done) => server.close(() => done()));
  });

  it('UC-14.1/AC1, AC7 don COD: thieu tai khoan 400; du thi 201 REQUESTED, khach khong doc lai so tai khoan', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    const stock = await onHand(orderItemId);
    const eligibility = await t.http
      .get(`/api/orders/${orderId}/returns/eligibility`)
      .set(w.buyer.auth)
      .expect(200);
    expect(eligibility.headers['cache-control']).toBe('no-store');
    expect(eligibility.body).toMatchObject({
      eligible: true,
      blocker: null,
      refundMethod: 'BANK_TRANSFER',
      windowDays: 15,
      items: [{ orderItemId, quantity: 1 }],
    });

    const line = { items: [{ orderItemId, quantity: 1 }], reasonCode: 'SIZE_MISMATCH' };
    const missing = await submit(w.buyer, orderId, line).expect(400);
    expect(missing.body.code).toBe('REFUND_ACCOUNT_REQUIRED');

    const created = await submit(w.buyer, orderId, { ...line, refundAccount: account }).expect(201);
    expect(created.body).toMatchObject({
      status: 'REQUESTED',
      orderId,
      reasonCode: 'SIZE_MISMATCH',
      refundAmount: '200000.00',
      refundShipping: '0.00',
      refundMethod: 'BANK_TRANSFER',
      shopPaysReturnShipping: false,
      hasRefundAccount: true,
      canCancel: true,
    });
    const mine = await t.http.get('/api/returns').set(w.buyer.auth).expect(200);
    expect(JSON.stringify(created.body) + JSON.stringify(mine.body)).not.toContain('0123456789');
    const stored = await t.prisma.return.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(stored.refundAccountNumber).toBe('0123456789');
    expect(await onHand(orderItemId)).toBe(stock);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'DELIVERED',
    );
  });

  it('UC-14.1/AC2 dung 15 ngay van gui duoc; qua han thi 409 va trang don khong mo nut', async () => {
    const first = await w.deliveredItem();
    await deliveredDaysAgo(first.orderId, 15);
    // Moc 15 ngay tinh tu lich su; vai mili giay chay test van nam trong han.
    await t.prisma.orderStatusHistory.updateMany({
      where: { orderId: first.orderId, status: 'DELIVERED' },
      data: { createdAt: new Date(Date.now() - 15 * DAY_MS + 60_000) },
    });
    await submit(w.buyer, first.orderId, {
      items: [{ orderItemId: first.orderItemId, quantity: 1 }],
      reasonCode: 'CHANGED_MIND',
      refundAccount: account,
    }).expect(201);

    const late = await w.deliveredItem();
    await deliveredDaysAgo(late.orderId, 16);
    const closed = await submit(w.buyer, late.orderId, {
      items: [{ orderItemId: late.orderItemId, quantity: 1 }],
      reasonCode: 'CHANGED_MIND',
      refundAccount: account,
    }).expect(409);
    expect(closed.body.code).toBe('RETURN_WINDOW_CLOSED');
    const eligibility = await t.http
      .get(`/api/orders/${late.orderId}/returns/eligibility`)
      .set(w.buyer.auth)
      .expect(200);
    expect(eligibility.body).toMatchObject({ eligible: false, blocker: 'WINDOW_CLOSED' });
  });

  it('UC-14.1/AC3 don chua giao: 409; don cua khach khac: 404', async () => {
    const placed = await w.placeOrder();
    const body = {
      items: [{ orderItemId: placed.orderItemId, quantity: 1 }],
      reasonCode: 'SIZE_MISMATCH',
      refundAccount: account,
    };
    expect((await submit(w.buyer, placed.orderId, body).expect(409)).body.code).toBe(
      'RETURN_NOT_ALLOWED',
    );
    await w.markDelivered(placed.orderId);
    await submit(w.other, placed.orderId, body).expect(404);
    expect(await t.prisma.return.count()).toBe(0);
  });

  it('UC-14.1/AC4, UC-14.2/AC2 yeu cau thu hai 409; tu choi khong ly do 400, co ly do thi khach thay va gui lai duoc', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    const body = {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'NOT_AS_EXPECTED',
      refundAccount: account,
    };
    const first = await submit(w.buyer, orderId, body).expect(201);
    expect((await submit(w.buyer, orderId, body).expect(409)).body.code).toBe('RETURN_EXISTS');

    await admin(`${first.body.id}/reject`, {}).expect(400);
    await admin(`${first.body.id}/reject`, { note: '   ' }).expect(400);
    const rejected = await admin(`${first.body.id}/reject`, {
      note: 'Sản phẩm đã qua sử dụng, không đủ điều kiện.',
    }).expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', refundAccount: null });
    const seen = await t.http.get(`/api/returns/${first.body.id}`).set(w.buyer.auth).expect(200);
    expect(seen.body.decisionNote).toBe('Sản phẩm đã qua sử dụng, không đủ điều kiện.');

    await submit(w.buyer, orderId, body).expect(201);
  });

  it('UC-14.1/AC5 tra nhieu hon so da mua, mon khong thuoc don, mot mon hai dong: 400', async () => {
    const { orderId, orderItemId } = await w.deliveredItem(2);
    const other = await w.deliveredItem();
    const send = (items: unknown[]) =>
      submit(w.buyer, orderId, { items, reasonCode: 'SIZE_MISMATCH', refundAccount: account });
    expect((await send([{ orderItemId, quantity: 3 }]).expect(400)).body.code).toBe(
      'INVALID_RETURN_ITEMS',
    );
    await send([{ orderItemId: other.orderItemId, quantity: 1 }]).expect(400);
    await send([
      { orderItemId, quantity: 1 },
      { orderItemId, quantity: 1 },
    ]).expect(400);
    await send([{ orderItemId, quantity: 0 }]).expect(400);
    await send([]).expect(400);
    expect(await t.prisma.return.count()).toBe(0);
  });

  it('UC-14.1/AC6 loi/hu khong anh: 400; co 1 anh thi 201, shop chiu phi gui tra; anh nguoi khac 422', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    const body = {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'DEFECTIVE',
      refundAccount: account,
    };
    expect((await submit(w.buyer, orderId, body).expect(400)).body.code).toBe(
      'RETURN_PHOTO_REQUIRED',
    );
    const foreign = await photo(w.other);
    await submit(w.buyer, orderId, { ...body, mediaKeys: [foreign] }).expect(422);

    const key = await photo(w.buyer);
    const created = await submit(w.buyer, orderId, { ...body, mediaKeys: [key] }).expect(201);
    expect(created.body).toMatchObject({
      shopPaysReturnShipping: true,
      media: [{ url: `https://cdn.test/${key}.jpg` }],
    });
    expect(await t.prisma.mediaUpload.count({ where: { storageKey: key } })).toBe(0);
  });

  it('UC-14.1/AC8 khach huy khi REQUESTED; da duyet thi 409; khach khac khong xem duoc', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    const body = {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'SIZE_MISMATCH',
      refundAccount: account,
    };
    const first = await submit(w.buyer, orderId, body).expect(201);
    await t.http.get(`/api/returns/${first.body.id}`).set(w.other.auth).expect(404);
    const cancelled = await t.http
      .post(`/api/returns/${first.body.id}/cancel`)
      .set(w.buyer.auth)
      .expect(200);
    expect(cancelled.body).toMatchObject({ status: 'CANCELLED', hasRefundAccount: false });

    const second = await submit(w.buyer, orderId, body).expect(201);
    await admin(`${second.body.id}/approve`).expect(200);
    const late = await t.http
      .post(`/api/returns/${second.body.id}/cancel`)
      .set(w.buyer.auth)
      .expect(409);
    expect(late.body.code).toBe('RETURN_STATE_CHANGED');
  });

  it('UC-14.2/AC1, AC3, AC4, AC6 COD: duyet, nhan hang song song chi cong kho mot lan, hoan tay xoa tai khoan', async () => {
    const { orderId, orderItemId, returnId } = await approvedCodReturn(2);
    const approved = await t.http
      .get(`/api/admin/returns/${returnId}`)
      .set(w.admin.auth)
      .expect(200);
    expect(approved.body).toMatchObject({
      status: 'APPROVED',
      decisionNote: 'Gửi hàng về kho Q1.',
      customerEmail: w.buyer.email,
      refundAccount: { accountNumber: '0123456789' },
      paymentGateway: 'COD',
    });
    const stock = await onHand(orderItemId);

    const [a, b] = await Promise.all([admin(`${returnId}/receive`), admin(`${returnId}/receive`)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await onHand(orderItemId)).toBe(stock + 2);
    expect(await t.prisma.stockMovement.count({ where: { orderId, movementType: 'RETURN' } })).toBe(
      1,
    );

    expect((await admin(`${returnId}/refund`).expect(400)).body.code).toBe(
      'TRANSFER_REFERENCE_REQUIRED',
    );
    const done = await admin(`${returnId}/refund`, { transferReference: 'FT26318ABC' }).expect(200);
    expect(done.body).toMatchObject({
      status: 'COMPLETED',
      refundAccount: null,
      refund: { status: 'SUCCEEDED', amount: '400000.00', reference: 'REFUND:MANUAL:FT26318ABC' },
    });
    const stored = await t.prisma.return.findUniqueOrThrow({ where: { id: returnId } });
    expect([stored.refundBankName, stored.refundAccountNumber, stored.refundAccountHolder]).toEqual(
      [null, null, null],
    );
    const order = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    // Tra ca don vi co khong vua: hoan tien hang, khong hoan phi giao nen don con mot phan.
    expect(order.status).toBe('PARTIALLY_REFUNDED');
    const ledger = await t.prisma.paymentTransaction.findFirstOrThrow({
      where: { externalTransactionId: 'REFUND:MANUAL:FT26318ABC' },
    });
    expect(ledger).toMatchObject({ gateway: 'COD', status: 'PROCESSED' });
    expect((ledger.payload as { refundedAmount: string }).refundedAmount).toBe('400000.00');

    await admin(`${returnId}/refund`, { transferReference: 'FT26318ABD' }).expect(409);
  });

  it('UC-14.2/AC7 sai thu tu: nhan hang khi chua duyet, hoan khi chua nhan: 409, kho va tien khong doi', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    const created = await submit(w.buyer, orderId, {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'SIZE_MISMATCH',
      refundAccount: account,
    }).expect(201);
    const stock = await onHand(orderItemId);
    await admin(`${created.body.id}/receive`).expect(409);
    await admin(`${created.body.id}/refund`, { transferReference: 'FT0001' }).expect(409);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/refund`, { transferReference: 'FT0001' }).expect(409);
    expect(await onHand(orderItemId)).toBe(stock);
    expect(await t.prisma.refund.count()).toBe(0);
  });

  it('UC-14.2/AC8 khach goi API quan tri tra hang: 403', async () => {
    const { returnId } = await approvedCodReturn();
    await t.http.get('/api/admin/returns').set(w.buyer.auth).expect(403);
    await t.http.post(`/api/admin/returns/${returnId}/receive`).set(w.buyer.auth).expect(403);
    const queue = await t.http
      .get('/api/admin/returns?status=APPROVED')
      .set(w.admin.auth)
      .expect(200);
    expect(queue.body).toMatchObject({ total: 1, items: [{ id: returnId }] });
  });

  it('UC-14.2/AC5 don VNPAY: hoan qua cong dung tien mon tra, don PARTIALLY_REFUNDED, yeu cau COMPLETED', async () => {
    await w.deliveredItem();
    const { orderId, orderItemId, paymentId } = await deliveredVnpayOrder();
    const eligibility = await t.http
      .get(`/api/orders/${orderId}/returns/eligibility`)
      .set(w.buyer.auth)
      .expect(200);
    expect(eligibility.body.refundMethod).toBe('GATEWAY');
    const created = await submit(w.buyer, orderId, {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'NOT_AS_EXPECTED',
    }).expect(201);
    expect(created.body.hasRefundAccount).toBe(false);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/receive`).expect(200);

    const done = await admin(`${created.body.id}/refund`).expect(200);
    expect(done.body).toMatchObject({
      status: 'COMPLETED',
      refund: { status: 'SUCCEEDED', amount: '200000.00' },
    });
    expect(done.body.refund.reference).toMatch(/^REFUND:/);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PARTIALLY_REFUNDED',
    );
    const refunded = await t.prisma.paymentTransaction.findMany({
      where: { paymentId, externalTransactionId: { startsWith: 'REFUND:' } },
    });
    expect(refunded).toHaveLength(1);
    expect((refunded[0]!.payload as { refundedAmount: string }).refundedAmount).toBe('200000.00');
  });

  it('UC-14.2/E3 cong mat ket noi: giu RECEIVED; chot FAILED o trang don roi bam lai thi hoan bang lenh moi', async () => {
    await w.deliveredItem();
    const { orderId, orderItemId, paymentId } = await deliveredVnpayOrder();
    const created = await submit(w.buyer, orderId, {
      items: [{ orderItemId, quantity: 2 }],
      reasonCode: 'CHANGED_MIND',
    }).expect(201);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/receive`).expect(200);

    gateway = 'drop';
    await admin(`${created.body.id}/refund`).expect(503);
    const pending = await t.http
      .get(`/api/admin/returns/${created.body.id}`)
      .set(w.admin.auth)
      .expect(200);
    expect(pending.body).toMatchObject({ status: 'RECEIVED', refund: { status: 'PROCESSING' } });
    expect((await admin(`${created.body.id}/refund`).expect(409)).body.code).toBe('REFUND_PENDING');

    await t.http
      .post(`/api/admin/payments/${paymentId}/refund/resolve`)
      .set(w.admin.auth)
      .send({ outcome: 'FAILED', note: 'Merchant portal không có giao dịch hoàn.' })
      .expect(201);
    gateway = 'ok';
    const done = await admin(`${created.body.id}/refund`).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', refund: { status: 'SUCCEEDED' } });
    expect(await t.prisma.refund.count()).toBe(1);
    expect(
      await t.prisma.paymentTransaction.count({
        where: { paymentId, externalTransactionId: { startsWith: 'REFUND:' } },
      }),
    ).toBe(1);
  });

  it('UC-14.2/E3 lenh treo duoc chot SUCCEEDED o trang don: yeu cau tra tu dong COMPLETED', async () => {
    await w.deliveredItem();
    const { orderId, orderItemId, paymentId } = await deliveredVnpayOrder();
    const created = await submit(w.buyer, orderId, {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'SIZE_MISMATCH',
    }).expect(201);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/receive`).expect(200);
    gateway = 'drop';
    await admin(`${created.body.id}/refund`).expect(503);

    await t.http
      .post(`/api/admin/payments/${paymentId}/refund/resolve`)
      .set(w.admin.auth)
      .send({ outcome: 'SUCCEEDED', note: 'Merchant portal báo đã hoàn.' })
      .expect(201);
    const seen = await t.http.get(`/api/returns/${created.body.id}`).set(w.buyer.auth).expect(200);
    expect(seen.body.status).toBe('COMPLETED');
    const refund = await t.prisma.refund.findFirstOrThrow({ where: { returnId: created.body.id } });
    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.externalRefundId).toMatch(/^REFUND:MANUAL:/);
  });

  it('UC-14.2/E3 ADR-111 cong treo: chot FAILED roi nhap ma chuyen khoan, yeu cau COMPLETED, mot dong refunds', async () => {
    await w.deliveredItem();
    const { orderId, orderItemId, paymentId } = await deliveredVnpayOrder();
    const created = await submit(w.buyer, orderId, {
      items: [{ orderItemId, quantity: 1 }],
      reasonCode: 'NOT_AS_EXPECTED',
      mediaKeys: [await photo(w.buyer)],
    }).expect(201);
    await admin(`${created.body.id}/approve`).expect(200);
    await admin(`${created.body.id}/receive`).expect(200);
    gateway = 'drop';
    await admin(`${created.body.id}/refund`).expect(503);
    await admin(`${created.body.id}/refund`, { transferReference: 'FT26112003' }).expect(409);
    await t.http
      .post(`/api/admin/payments/${paymentId}/refund/resolve`)
      .set(w.admin.auth)
      .send({ outcome: 'FAILED', note: 'Merchant portal không có giao dịch hoàn.' })
      .expect(201);
    const done = await admin(`${created.body.id}/refund`, {
      transferReference: 'FT26112003',
    }).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED', refund: { status: 'SUCCEEDED' } });
    const rows = await t.prisma.refund.findMany({ where: { returnId: created.body.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.externalRefundId).toBe('REFUND:MANUAL:FT26112003');
  });

  it('UC-14.2/AC9 hoan qua cong va nhap ma chuyen khoan cung luc tren mot yeu cau: tien ra dung mot lan', async () => {
    const { orderId, paymentId, returnId } = await receivedVnpayReturn();

    const release = await holdOrder(orderId);
    const viaGateway = admin(`${returnId}/refund`).then((response) => response);
    await queued(1);
    const viaTransfer = admin(`${returnId}/refund`, { transferReference: 'FT26112101' }).then(
      (response) => response,
    );
    await queued(2);
    await release();
    const [gatewayReply, transferReply] = await Promise.all([viaGateway, viaTransfer]);

    expect({
      gateway: gatewayReply.status,
      transfer: transferReply.status,
      transferCode: transferReply.body.code,
      gatewayCalls: refundCalls,
      refunded: await refundedAmounts(paymentId),
    }).toEqual({
      gateway: 200,
      transfer: 409,
      transferCode: 'REFUND_PENDING',
      gatewayCalls: 1,
      refunded: ['200000.00'],
    });
    expect(gatewayReply.body).toMatchObject({
      status: 'COMPLETED',
      refund: { status: 'SUCCEEDED', amount: '200000.00' },
    });
    expect(await t.prisma.refund.count({ where: { returnId } })).toBe(1);
  });

  it('UC-14.2/AC10 hai lan bam hoan qua cong cung luc: cong nhan mot lenh, yeu cau COMPLETED, bam nua khong hoan them', async () => {
    const { orderId, paymentId, returnId } = await receivedVnpayReturn();

    const release = await holdOrder(orderId);
    const first = admin(`${returnId}/refund`).then((response) => response);
    await queued(1);
    const second = admin(`${returnId}/refund`).then((response) => response);
    await queued(2);
    await release();
    const [firstReply, secondReply] = await Promise.all([first, second]);
    const again = await admin(`${returnId}/refund`);

    expect({
      first: firstReply.status,
      second: secondReply.status,
      secondCode: secondReply.body.code,
      again: again.status,
      gatewayCalls: refundCalls,
      refunded: await refundedAmounts(paymentId),
      returnStatus: (await t.prisma.return.findUniqueOrThrow({ where: { id: returnId } })).status,
    }).toEqual({
      first: 200,
      second: 409,
      secondCode: 'REFUND_PENDING',
      again: 409,
      gatewayCalls: 1,
      refunded: ['200000.00'],
      returnStatus: 'COMPLETED',
    });
  });

  it('UC-14.2/AC11 ma chuyen khoan da ghi cho don COD khong ghi lai duoc cho don VNPAY', async () => {
    const cod = await approvedCodReturn();
    await admin(`${cod.returnId}/receive`).expect(200);
    await admin(`${cod.returnId}/refund`, { transferReference: 'FT26112201' }).expect(200);
    const vnpay = await receivedVnpayReturn();

    const reused = await admin(`${vnpay.returnId}/refund`, { transferReference: 'FT26112201' });
    expect({
      status: reused.status,
      message: reused.body.message,
      refunded: await refundedAmounts(vnpay.paymentId),
      returnStatus: (await t.prisma.return.findUniqueOrThrow({ where: { id: vnpay.returnId } }))
        .status,
    }).toEqual({
      status: 409,
      message: 'Mã giao dịch này đã được ghi cho một lần hoàn khác.',
      refunded: [],
      returnStatus: 'RECEIVED',
    });

    const fresh = await admin(`${vnpay.returnId}/refund`, {
      transferReference: 'FT26112202',
    }).expect(200);
    expect(fresh.body).toMatchObject({
      status: 'COMPLETED',
      refund: { status: 'SUCCEEDED', reference: 'REFUND:MANUAL:FT26112202' },
    });
  });

  it('UC-14.2/AC11 hai ADMIN nhap cung mot ma chuyen khoan cho hai don khac cong cung luc: chi mot lan duoc ghi', async () => {
    const cod = await approvedCodReturn();
    await admin(`${cod.returnId}/receive`).expect(200);
    const vnpay = await receivedVnpayReturn();
    // Hai don cung chu da xep hang san sau khoa gio cua chu (withOrder). Doi chu don VNPAY de hai lan
    // hoan chay song song that, nhu don cua hai khach khac nhau.
    await t.prisma.order.update({ where: { id: vnpay.orderId }, data: { userId: w.other.id } });

    const release = await holdLedgerWrites();
    const first = admin(`${cod.returnId}/refund`, { transferReference: 'FT26112203' }).then(
      (response) => response,
    );
    const second = admin(`${vnpay.returnId}/refund`, { transferReference: 'FT26112203' }).then(
      (response) => response,
    );
    await queued(2);
    await release();
    const replies = await Promise.all([first, second]);

    expect({
      statuses: replies.map((reply) => reply.status).sort(),
      ledgerRows: await t.prisma.paymentTransaction.count({
        where: { externalTransactionId: 'REFUND:MANUAL:FT26112203' },
      }),
      completed: await t.prisma.return.count({
        where: { id: { in: [cod.returnId, vnpay.returnId] }, status: 'COMPLETED' },
      }),
    }).toEqual({ statuses: [200, 409], ledgerRows: 1, completed: 1 });
  });

  it('UC-14.2/AC12 con lenh hoan cho cong: chi tiet va danh sach bao refundPending du moi truong da chuyen sang hoan tay; chot FAILED thi het', async () => {
    const { paymentId, returnId } = await receivedVnpayReturn();
    const detail = async () =>
      (await t.http.get(`/api/admin/returns/${returnId}`).set(w.admin.auth).expect(200)).body;
    expect(await detail()).toMatchObject({ refundMethod: 'GATEWAY', refundPending: false });

    gateway = 'drop';
    await admin(`${returnId}/refund`).expect(503);
    // Moi truong tat hoan VNPAY qua cong SAU khi lenh da gui (staging doi REFUND_GATEWAYS luc con lenh
    // treo): man hinh chuyen sang "chuyen khoan" trong khi cong van co the tra tien.
    const config = t.app.get(ConfigService);
    const original = config.get.bind(config) as (key: string, ...rest: unknown[]) => unknown;
    const manualOnly = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, ...rest: unknown[]) =>
        key === 'REFUND_GATEWAYS' ? 'none' : original(key, ...rest)) as typeof config.get);
    try {
      expect(await detail()).toMatchObject({
        status: 'RECEIVED',
        refundMethod: 'BANK_TRANSFER',
        refundPending: true,
        refund: { status: 'PROCESSING' },
      });
      const listed = await t.http
        .get('/api/admin/returns?status=RECEIVED')
        .set(w.admin.auth)
        .expect(200);
      expect(
        (listed.body.items as { id: string; refundPending: boolean }[]).find(
          (row) => row.id === returnId,
        ),
      ).toMatchObject({ refundPending: true });
      expect(
        (await admin(`${returnId}/refund`, { transferReference: 'FT26112204' }).expect(409)).body
          .code,
      ).toBe('REFUND_PENDING');

      await t.http
        .post(`/api/admin/payments/${paymentId}/refund/resolve`)
        .set(w.admin.auth)
        .send({ outcome: 'FAILED', note: 'Merchant portal không có giao dịch hoàn.' })
        .expect(201);
      expect(await detail()).toMatchObject({ refundMethod: 'BANK_TRANSFER', refundPending: false });
      const done = await admin(`${returnId}/refund`, {
        transferReference: 'FT26112204',
      }).expect(200);
      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        refundPending: false,
        refund: { status: 'SUCCEEDED', reference: 'REFUND:MANUAL:FT26112204' },
      });
    } finally {
      manualOnly.mockRestore();
    }
  });

  it('UC-14.2/AC13 don con yeu cau tra chua dong: trang don khong hoan (qua cong hay chuyen khoan) 409 RETURN_OPEN; hoan o trang tra hang van dong yeu cau', async () => {
    const { paymentId, returnId } = await receivedVnpayReturn();
    const orderPageRefund = (body: Record<string, unknown> = {}) =>
      t.http.post(`/api/admin/payments/${paymentId}/refund`).set(w.admin.auth).send(body);
    const calls = refundCalls;
    expect((await orderPageRefund().expect(409)).body.code).toBe('RETURN_OPEN');
    expect(refundCalls).toBe(calls);

    const config = t.app.get(ConfigService);
    const original = config.get.bind(config) as (key: string, ...rest: unknown[]) => unknown;
    const manualOnly = vi
      .spyOn(config, 'get')
      .mockImplementation(((key: string, ...rest: unknown[]) =>
        key === 'REFUND_GATEWAYS' ? 'none' : original(key, ...rest)) as typeof config.get);
    try {
      // Review PR #158: hoan tay o trang don lam don REFUNDED ma yeu cau tra ket o RECEIVED.
      expect(
        (await orderPageRefund({ transferReference: 'FT26112205' }).expect(409)).body.code,
      ).toBe('RETURN_OPEN');
      expect(await refundedAmounts(paymentId)).toEqual([]);
      const done = await admin(`${returnId}/refund`, {
        transferReference: 'FT26112205',
      }).expect(200);
      expect(done.body).toMatchObject({
        status: 'COMPLETED',
        refund: { status: 'SUCCEEDED', reference: 'REFUND:MANUAL:FT26112205' },
      });
    } finally {
      manualOnly.mockRestore();
    }
  });
});
