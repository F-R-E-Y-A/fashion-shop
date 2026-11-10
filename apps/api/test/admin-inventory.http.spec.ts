import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('UC-13.1 tồn kho admin HTTP PostgreSQL', () => {
  let t: TestApp;
  let token: string;
  let customer: string;
  let variantId: string;
  const path = '/api/admin/inventory';
  const headers = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    const admin = await t.prisma.user.create({
      data: { email: 'inventory-admin@example.test', passwordHash: 'test-only', status: 'ACTIVE' },
    });
    await grantAdminRole(t.prisma, admin.email);
    token = await t.app.get(JwtService).signAsync({ sub: admin.id, ver: admin.authVersion });
    const user = await t.prisma.user.create({
      data: {
        email: 'inventory-customer@example.test',
        passwordHash: 'test-only',
        status: 'ACTIVE',
      },
    });
    customer = await t.app.get(JwtService).signAsync({ sub: user.id, ver: user.authVersion });
    variantId = (await t.prisma.productVariant.findFirstOrThrow()).id;
  });
  it('UC-13.1/AC1 auth trước validation, UUID/param lạ bị chặn, missing404, no-store', async () => {
    for (const suffix of ['', '/bad-id']) {
      await t.http.get(path + suffix).expect(401);
      await t.http
        .get(path + suffix)
        .set({ Authorization: `Bearer ${customer}` })
        .expect(403);
    }
    await t.http
      .get(path + '/bad-id')
      .set(headers())
      .expect(400);
    await t.http
      .get(path + '/' + randomUUID())
      .set(headers())
      .expect(404);
    const result = await t.http.get(path).set(headers()).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body.items[0]).sort()).toEqual(
      [
        'id',
        'sku',
        'productName',
        'colorName',
        'sizeCode',
        'quantityOnHand',
        'reservedQuantity',
        'availableQuantity',
      ].sort(),
    );
    expect(JSON.stringify(result.body)).not.toContain('@example.test');
  });
  it.each([
    'page=0',
    'page=1e3',
    'page=2.5',
    'page=1&page=2',
    'page=100001',
    'pageSize=61',
    'pageSize=0',
    'pageSize=1&pageSize=2',
    'unknown=1',
  ])('UC-13.1/AC1 validation %s', async (query) => {
    await t.http
      .get(path + '?' + query)
      .set(headers())
      .expect(400);
    await t.http
      .get(path + '/' + variantId + '?' + query)
      .set(headers())
      .expect(400);
  });
  it('UC-13.1/AC2 thiếu Inventory là null khác tồn0; bao gồm biến thể đã ẩn', async () => {
    await t.prisma.inventory.deleteMany();
    await t.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    const empty = await t.http
      .get(path + '/' + variantId)
      .set(headers())
      .expect(200);
    expect(empty.body).toMatchObject({
      quantityOnHand: null,
      reservedQuantity: 0,
      availableQuantity: null,
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 0 } });
    const zero = await t.http
      .get(path + '/' + variantId)
      .set(headers())
      .expect(200);
    expect(zero.body).toMatchObject({ quantityOnHand: 0, availableQuantity: 0 });
    const ids: string[] = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const result = await t.http
        .get(path + `?page=${page}&pageSize=1`)
        .set(headers())
        .expect(200);
      totalPages = result.body.totalPages;
      ids.push(...result.body.items.map((v: { id: string }) => v.id));
    }
    expect(ids).toContain(variantId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('UC-13.1/AC2 chỉ trừ hold chưa nhả và chưa hết hạn; không thay quantityOnHand', async () => {
    await t.prisma.inventory.upsert({
      where: { productVariantId: variantId },
      create: { productVariantId: variantId, quantityOnHand: 10 },
      update: { quantityOnHand: 10 },
    });
    for (const [index, quantity, expired, released] of [
      [1, 3, false, false],
      [2, 7, true, false],
      [3, 8, false, true],
    ] as const) {
      const order = await t.prisma.order.create({
        data: {
          orderCode: `INVENTORY-TEST-${index}`,
          customerEmail: 'fixture@example.test',
          status: 'PENDING_PAYMENT',
          shippingAddressSnapshot: { fixture: true },
          subtotalAmount: '100',
          discountAmount: '0',
          shippingFeeAmount: '0',
          totalAmount: '100',
        },
      });
      const now = Date.now();
      await t.prisma.inventoryReservation.create({
        data: {
          productVariantId: variantId,
          orderId: order.id,
          quantity,
          createdAt: new Date(now - 120000),
          expiresAt: new Date(now + (expired ? -60000 : 60000)),
          releasedAt: released ? new Date(now) : null,
        },
      });
    }
    const result = await t.http
      .get(path + '/' + variantId)
      .set(headers())
      .expect(200);
    expect(result.body).toMatchObject({
      quantityOnHand: 10,
      reservedQuantity: 3,
      availableQuantity: 7,
    });
    expect(result.body.movements.total).toBe(0);
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(10);
  });
  it('UC-13.1/AC3 lịch sử theo variant, ổn định khi cùng timestamp, phân trang độc lập', async () => {
    const createdAt = new Date('2026-11-10T00:00:00Z');
    const ids = Array.from({ length: 3 }, () => randomUUID())
      .sort()
      .reverse();
    for (const id of ids)
      await t.prisma.stockMovement.create({
        data: {
          id,
          productVariantId: variantId,
          movementType: 'ADJUSTMENT',
          quantityDelta: 2,
          createdAt,
        },
      });
    const other = await t.prisma.productVariant.findFirstOrThrow({
      where: { id: { not: variantId } },
    });
    await t.prisma.stockMovement.create({
      data: { productVariantId: other.id, movementType: 'RECEIPT', quantityDelta: 99 },
    });
    const result = await t.http
      .get(path + '/' + variantId + '?page=2&pageSize=1')
      .set(headers())
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.movements).toMatchObject({ total: 3, page: 2, totalPages: 3 });
    expect(result.body.movements.items[0].id).toBe(ids[1]);
    expect(Object.keys(result.body.movements.items[0]).sort()).toEqual(
      ['id', 'movementType', 'quantityDelta', 'createdAt'].sort(),
    );
  });
});
