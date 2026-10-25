import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
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

  it('quote co COD luon san sang, dung duoc ngay ca khi khong co key online', async () => {
    const body = (await preview().expect(201)).body;
    expect(body.gateways.find((gateway: { code: string }) => gateway.code === 'COD')).toMatchObject(
      { configured: true },
    );
  });

  it('don COD: PENDING_CONFIRMATION, khong link, giu hang dai han, chan don thu hai', async () => {
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
    await createCod().catch((error: { status: number; body: { code?: string } }) => {
      expect(error.status).toBe(409);
    });
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

  it('huy don COD tra hang ve kho va cho dat lai', async () => {
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

  it('thu tien khi giao: chi ADMIN chot, xong don CONFIRMED, SALE dung luong, gio tru mon', async () => {
    const order = await createCod();
    const outsider = await t.prisma.user.create({
      data: { email: 'khach@fixture.test', passwordHash: 'x', status: 'ACTIVE' },
    });
    const outsiderToken = await t.app.get(JwtService).signAsync({ sub: outsider.id, ver: 0 });
    await t.http
      .post(`/api/orders/${order.id}/collect-cod`)
      .set({ Authorization: `Bearer ${outsiderToken}` })
      .expect(403);
    const collected = (
      await t.http
        .post(`/api/orders/${order.id}/collect-cod`)
        .set({ Authorization: `Bearer ${adminToken}` })
        .expect(201)
    ).body;
    expect(collected.status).toBe('CONFIRMED');
    const sale = await t.prisma.stockMovement.findFirstOrThrow({
      where: { orderId: order.id, movementType: 'SALE' },
    });
    expect(sale.quantityDelta).toBe(-2);
    expect(
      await t.prisma.inventoryReservation.count({ where: { orderId: order.id, releasedAt: null } }),
    ).toBe(0);
    const cart = await t.http.get('/api/cart').set(auth()).expect(200);
    expect(cart.body.items).toHaveLength(0);
    // Chot hai lan bi tu choi.
    await t.http
      .post(`/api/orders/${order.id}/collect-cod`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(409);
  });
});
