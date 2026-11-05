import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { OrdersService } from '../src/modules/orders/index.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

interface View {
  id: string;
  orderCode: string;
  status: string;
  paymentDueAt: string | null;
  totalAmount: string;
  payments: {
    gateway: string;
    status: string;
    checkoutUrl: string | null;
    expiresAt: string | null;
  }[];
}

describe('PH-11 COD: tao don, giu hang, thu tien khi giao (PostgreSQL)', () => {
  let t: TestApp;
  let token: string;
  let adminToken: string;
  let userId: string;
  let addressId: string;
  let variantId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = () => t.http.post('/api/checkout/preview').set(auth()).send({ addressId });
  const createCod = async (): Promise<View> => {
    const quote = await preview().expect(201);
    return (
      await t.http
        .post('/api/checkout/orders')
        .set(auth())
        .send({
          addressId,
          fingerprint: quote.body.fingerprint,
          idempotencyKey: randomUUID(),
          gateway: 'COD',
        })
        .expect(201)
    ).body;
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const user = await t.prisma.user.create({
      data: { email: 'cod@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    userId = user.id;
    token = await t.app.get(JwtService).signAsync({ sub: userId, ver: 0 });
    expect((await grantAdminRole(t.prisma, 'cod@fixture.test')).outcome).toBe('GRANTED');
    adminToken = token;
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
          recipientName: 'Khách COD',
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
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 2 }).expect(201);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-07.1/AC8 quote co COD luon san sang, dung duoc ngay ca khi khong co key online', async () => {
    const body = (await preview().expect(201)).body;
    expect(body.gateways.find((gateway: { code: string }) => gateway.code === 'COD')).toMatchObject(
      { configured: true },
    );
  });

  it('UC-07.1/AC7 don COD: PENDING_CONFIRMATION, khong link, giu hang dai han, gui lai cung gio tra cung don', async () => {
    const order = await createCod();
    expect(order.status).toBe('PENDING_CONFIRMATION');
    expect(order.payments[0]).toMatchObject({
      gateway: 'COD',
      status: 'PENDING',
      checkoutUrl: null,
      expiresAt: null,
    });
    // Giu hang dai hon nhieu so voi 15 phut cua tra tien truoc.
    const horizon = Date.parse(order.paymentDueAt!) - Date.now();
    expect(horizon).toBeGreaterThan(2 * 24 * 60 * 60 * 1000);
    const reservation = await t.prisma.inventoryReservation.findFirstOrThrow({
      where: { orderId: order.id },
    });
    expect(reservation.quantity).toBe(2);
    // Cung gio, key moi (bam lai sau khi mat mang): tra lai don cu, khong tao don trung.
    expect((await createCod()).id).toBe(order.id);
    expect(await t.prisma.order.count()).toBe(1);
    const again = await t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({
        addressId,
        fingerprint: 'a'.repeat(64),
        idempotencyKey: randomUUID(),
        gateway: 'COD',
      });
    expect(again.status).toBe(409);
  });

  it('UC-07.1/AC9 ADR-040: don COD cho xac nhan khong chan don moi; den tran COD_MAX_PENDING_ORDERS (3) thi tat COD', async () => {
    const setQuantity = (quantity: number) =>
      t.http.patch(`/api/cart/items/${variantId}`).set(auth()).send({ quantity }).expect(200);
    const first = await createCod();
    // Don COD cho khong phai don cho thanh toan: preview khong chi ve no, khach dat tiep duoc.
    expect((await preview().expect(201)).body.pendingOrder).toBeNull();
    await setQuantity(1);
    const second = await createCod();
    await setQuantity(3);
    const third = await createCod();
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    // Gio khac ca ba don (so luong 4) de khong roi vao nhanh tra lai don cu cung gio.
    await setQuantity(4);
    expect(await codGateway()).toMatchObject({
      configured: false,
      unavailableReason: expect.stringContaining('3 đơn COD chờ shop xác nhận'),
    });
    const quote = await preview().expect(201);
    const blocked = await t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({
        addressId,
        fingerprint: quote.body.fingerprint,
        idempotencyKey: randomUUID(),
        gateway: 'COD',
      })
      .expect(409);
    expect(blocked.body.code).toBe('COD_UNAVAILABLE');
    expect(await t.prisma.order.count()).toBe(3);
    // Shop xac nhan mot don (PROCESSING) thi duoi tran tro lai.
    await admin(`${first.id}/confirm-cod`).expect(201);
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 1 }).expect(201);
    expect((await codGateway()).configured).toBe(true);
  });

  it('UC-07.4/AC3 huy don COD tra hang ve kho va cho dat lai', async () => {
    const order = await createCod();
    const cancelled = (await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201))
      .body;
    expect(cancelled.status).toBe('CANCELLED');
    expect(
      await t.prisma.inventoryReservation.count({ where: { orderId: order.id, releasedAt: null } }),
    ).toBe(0);
    const second = await createCod();
    expect(second.status).toBe('PENDING_CONFIRMATION');
  });

  const admin = (path: string, body?: object) =>
    t.http
      .post(`/api/admin/orders/${path}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send(body ?? {});
  const stock = async () =>
    (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
      .quantityOnHand;
  const codGateway = async () =>
    (await preview().expect(201)).body.gateways.find(
      (gateway: { code: string }) => gateway.code === 'COD',
    );
  async function failDelivery() {
    const order = await createCod();
    await admin(`${order.id}/confirm-cod`).expect(201);
    await admin(`${order.id}/delivery-failed`, { reason: 'Khách không nhận hàng' }).expect(201);
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 2 }).expect(201);
    return order;
  }

  it('UC-12.1/AC9 UC-07.4/AC6 ADR-038 xác nhận COD: chỉ ADMIN, chốt kho, trừ giỏ, hết tự hủy; khách không hủy được nữa', async () => {
    const order = await createCod();
    const outsider = await t.prisma.user.create({
      data: { email: 'khach@fixture.test', passwordHash: 'x', status: 'ACTIVE' },
    });
    const outsiderToken = await t.app.get(JwtService).signAsync({ sub: outsider.id, ver: 0 });
    await t.http
      .post(`/api/admin/orders/${order.id}/confirm-cod`)
      .set({ Authorization: `Bearer ${outsiderToken}` })
      .expect(403);
    const confirmed = (await admin(`${order.id}/confirm-cod`).expect(201)).body;
    expect(confirmed).toMatchObject({
      status: 'PROCESSING',
      canCancel: false,
      actions: { confirmCod: false, markDelivered: true, deliveryFailed: true },
    });
    expect(confirmed.payments[0].status).toBe('PENDING');
    const sale = await t.prisma.stockMovement.findFirstOrThrow({
      where: { orderId: order.id, movementType: 'SALE' },
    });
    expect(sale.quantityDelta).toBe(-2);
    expect(
      await t.prisma.inventoryReservation.count({ where: { orderId: order.id, releasedAt: null } }),
    ).toBe(0);
    expect((await t.http.get('/api/cart').set(auth()).expect(200)).body.items).toHaveLength(0);
    // Loi cu: worker huy don COD dang giao sau 3 ngay. Don PROCESSING khong con trong hang het han.
    await t.prisma.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(0) } });
    expect(await t.app.get(OrdersService).due()).toHaveLength(0);
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(409);
    await admin(`${order.id}/confirm-cod`).expect(409);
  });

  it('UC-12.2/AC1,AC2 giao thành công: DELIVERED, payment COD SUCCEEDED; bấm lại 409', async () => {
    const order = await createCod();
    await admin(`${order.id}/confirm-cod`).expect(201);
    const delivered = (await admin(`${order.id}/delivered`).expect(201)).body;
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.payments[0].status).toBe('SUCCEEDED');
    await admin(`${order.id}/delivered`).expect(409);
    await admin(`${order.id}/delivery-failed`, { reason: 'x' }).expect(409);
  });

  it('UC-12.2/AC3 giao thất bại: hàng về kho đúng một lần, payment FAILED, đơn CANCELLED', async () => {
    expect(await stock()).toBe(10);
    const order = await failDelivery();
    expect(await stock()).toBe(10);
    const returned = await t.prisma.stockMovement.findFirstOrThrow({
      where: { orderId: order.id, movementType: 'RETURN' },
    });
    expect(returned.quantityDelta).toBe(2);
    const detail = (
      await t.http
        .get(`/api/admin/orders/${order.id}`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(200)
    ).body;
    expect(detail.status).toBe('CANCELLED');
    expect(detail.payments[0].status).toBe('FAILED');
    expect(detail.history.map((row: { status: string }) => row.status)).toEqual([
      'PENDING_CONFIRMATION',
      'PROCESSING',
      'CANCELLED',
    ]);
    await admin(`${order.id}/delivery-failed`, { reason: 'lần hai' }).expect(409);
    expect(await stock()).toBe(10);
  });

  it('UC-07.1/AC10 chống bom: đủ 2 lần giao thất bại thì COD tắt kèm lý do, tạo đơn COD bị 409', async () => {
    await failDelivery();
    expect(await codGateway()).toMatchObject({ configured: true });
    await failDelivery();
    const cod = await codGateway();
    expect(cod).toMatchObject({ configured: false });
    expect(cod.unavailableReason).toContain('2 đơn COD');
    const quote = await preview().expect(201);
    const blocked = await t.http.post('/api/checkout/orders').set(auth()).send({
      addressId,
      fingerprint: quote.body.fingerprint,
      idempotencyKey: randomUUID(),
      gateway: 'COD',
    });
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toContain('COD_UNAVAILABLE');
  });

  it('UC-07.1/AC11 chống bom: đơn vượt trần COD (mặc định 2.000.000đ) chỉ nhận trả trước', async () => {
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '1500000' },
    });
    const cod = await codGateway();
    expect(cod).toMatchObject({ configured: false });
    expect(cod.unavailableReason).toContain('2.000.000');
  });

  it('UC-12.1/AC7,AC8 danh sách quản trị: mọi khách, lọc trạng thái, tìm mã đơn; khách thường 403', async () => {
    const order = await createCod();
    const other = await t.prisma.user.create({
      data: { email: 'khach2@fixture.test', passwordHash: 'x', status: 'ACTIVE' },
    });
    const otherToken = await t.app.get(JwtService).signAsync({ sub: other.id, ver: 0 });
    await t.http
      .get('/api/admin/orders')
      .set({ Authorization: `Bearer ${otherToken}` })
      .expect(403);
    await t.http.get('/api/admin/orders').expect(401);
    const list = async (query: string) =>
      (
        await t.http
          .get(`/api/admin/orders?${query}`)
          .set({ Authorization: `Bearer ${adminToken}` })
          .expect(200)
      ).body;
    const pending = await list('status=PENDING_CONFIRMATION,PROCESSING');
    expect(pending).toMatchObject({ total: 1, page: 1 });
    expect(pending.items[0]).toMatchObject({
      id: order.id,
      gateway: 'COD',
      customerEmail: 'cod@fixture.test',
      itemCount: 2,
    });
    expect((await list('status=DELIVERED')).total).toBe(0);
    const found = await list(`q=${order.orderCode.slice(-6).toLowerCase()}`);
    expect(found.items.map((row: { id: string }) => row.id)).toEqual([order.id]);
    await t.http
      .get('/api/admin/orders?status=NOPE')
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(400);
  });

  it('UC-07.1/AC12 qua 10 lan tao don moi phut mot tai khoan thi 429 kem Retry-After, khong tao them gi', async () => {
    const quote = await preview().expect(201);
    const body = {
      addressId,
      fingerprint: quote.body.fingerprint,
      idempotencyKey: randomUUID(),
      gateway: 'COD',
    };
    for (let i = 0; i < 10; i++)
      await t.http.post('/api/checkout/orders').set(auth()).send(body).expect(201);
    const blocked = await t.http.post('/api/checkout/orders').set(auth()).send(body).expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await t.prisma.order.count()).toBe(1);
  });
});
