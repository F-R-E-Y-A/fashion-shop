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

  it('UC-13.1 / Issue #92: low-stock kiểm soát quyền, validation, không nhầm :id, và lọc tồn thấp toàn cục', async () => {
    // 1. Quyền: guest 401, customer 403, admin 200
    await t.http.get(path + '/low-stock').expect(401);
    await t.http
      .get(path + '/low-stock')
      .set({ Authorization: `Bearer ${customer}` })
      .expect(403);

    // 2. Route không nhầm với :id (không bị 400 Bad UUID), no-store header
    const res = await t.http
      .get(path + '/low-stock')
      .set(headers())
      .expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      threshold: 5,
      asOf: expect.any(String),
    });

    // 3. Validation query bounds
    for (const badQuery of [
      'threshold=0',
      'threshold=101',
      'threshold=1e2',
      'threshold=2.5',
      'limit=0',
      'limit=11',
      'limit=2.5',
      'unknown=1',
    ]) {
      await t.http
        .get(path + '/low-stock?' + badQuery)
        .set(headers())
        .expect(400);
    }
  });

  it('UC-13.1 / Issue #92: low-stock kiểm chứng công thức PostgreSQL: GREATEST(0, ...), lọc hold còn hạn, phân ngưỡng, sort và total toàn cục', async () => {
    // Xóa sạch inventory & reservation để có fixture chính xác
    await t.prisma.inventoryReservation.deleteMany();
    await t.prisma.inventory.deleteMany();

    // Lấy 6 variants mẫu có thứ tự SKU rõ ràng
    const variants = await t.prisma.productVariant.findMany({
      take: 6,
      orderBy: { sku: 'asc' },
    });
    if (variants.length < 6) {
      throw new Error('Cần tối thiểu 6 biến thể mẫu để chạy test fixture tồn kho');
    }

    const [vAbove, vBoundary, vOverheld, vExpiredReleased, vZero, vNoInventory] = variants;

    // Helper tạo order để liên kết reservation
    const createTestOrder = async (code: string) => {
      return t.prisma.order.create({
        data: {
          orderCode: `LOW-STOCK-ORD-${code}-${randomUUID().slice(0, 8)}`,
          customerEmail: 'test-inventory@example.test',
          status: 'PENDING_PAYMENT',
          shippingAddressSnapshot: { fixture: true },
          subtotalAmount: '100',
          discountAmount: '0',
          shippingFeeAmount: '0',
          totalAmount: '100',
        },
      });
    };

    const order1 = await createTestOrder('1');
    const order2 = await createTestOrder('2');
    const now = Date.now();

    // 1. vAbove: onHand 10, active reserved 4 => available = 6 (> threshold 5 => BỊ LOẠI)
    await t.prisma.inventory.create({
      data: { productVariantId: vAbove.id, quantityOnHand: 10 },
    });
    await t.prisma.inventoryReservation.create({
      data: {
        productVariantId: vAbove.id,
        orderId: order1.id,
        quantity: 4,
        createdAt: new Date(now - 120000),
        expiresAt: new Date(now + 60000),
      },
    });

    // 2. vBoundary: onHand 5, reserved 0 => available = 5 (<= 5 => ĐƯỢC CHỌN, kiểm chứng biên threshold)
    await t.prisma.inventory.create({
      data: { productVariantId: vBoundary.id, quantityOnHand: 5 },
    });

    // 3. vOverheld: onHand 2, active reserved 5 => available = GREATEST(0, 2 - 5) = 0 (không âm, <= 5 => ĐƯỢC CHỌN)
    await t.prisma.inventory.create({
      data: { productVariantId: vOverheld.id, quantityOnHand: 2 },
    });
    await t.prisma.inventoryReservation.create({
      data: {
        productVariantId: vOverheld.id,
        orderId: order2.id,
        quantity: 5,
        createdAt: new Date(now - 120000),
        expiresAt: new Date(now + 60000),
      },
    });

    // 4. vExpiredReleased: onHand 4, có hold hết hạn (10) và hold đã nhả (5) => reserved hiệu lực = 0 => available = 4 (<= 5 => ĐƯỢC CHỌN)
    // Ràng buộc DB: CHECK(expires_at > created_at). Fixture expired phải có createdAt trước expiresAt.
    await t.prisma.inventory.create({
      data: { productVariantId: vExpiredReleased.id, quantityOnHand: 4 },
    });
    await t.prisma.inventoryReservation.createMany({
      data: [
        {
          productVariantId: vExpiredReleased.id,
          orderId: order1.id,
          quantity: 10,
          createdAt: new Date(now - 120000),
          expiresAt: new Date(now - 60000),
        },
        {
          productVariantId: vExpiredReleased.id,
          orderId: order2.id,
          quantity: 5,
          createdAt: new Date(now - 120000),
          expiresAt: new Date(now + 60000),
          releasedAt: new Date(now - 10000),
        },
      ],
    });

    // 5. vZero: onHand 0 => available = 0 (<= 5 => ĐƯỢC CHỌN)
    await t.prisma.inventory.create({
      data: { productVariantId: vZero.id, quantityOnHand: 0 },
    });

    // 6. vNoInventory: Không tạo bản ghi inventory (null inventory => INNER JOIN BỎ QUA)

    // Tổng số items thỏa mãn threshold <= 5 là 4 items: vOverheld (0), vZero (0), vExpiredReleased (4), vBoundary (5).
    // Khi gọi với limit=2: items trả về đúng 2 phần tử, nhưng total = 4
    const res = await t.http
      .get(path + '/low-stock?threshold=5&limit=2')
      .set(headers())
      .expect(200);

    expect(res.body.total).toBe(4);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.threshold).toBe(5);

    // Kiểm chứng sắp xếp availableQuantity ASC, sau đó SKU ASC
    const expectedFirstTwo = [vOverheld, vZero].sort((a, b) => a.sku.localeCompare(b.sku));
    expect(res.body.items[0]).toMatchObject({
      id: expectedFirstTwo[0].id,
      availableQuantity: 0,
      sku: expectedFirstTwo[0].sku,
    });
    expect(res.body.items[1]).toMatchObject({
      id: expectedFirstTwo[1].id,
      availableQuantity: 0,
      sku: expectedFirstTwo[1].sku,
    });

    // Lấy toàn bộ với limit=5 để kiểm chứng đủ 4 items và thứ tự tăng dần của availableQuantity
    const fullRes = await t.http
      .get(path + '/low-stock?threshold=5&limit=5')
      .set(headers())
      .expect(200);

    expect(fullRes.body.total).toBe(4);
    expect(fullRes.body.items).toHaveLength(4);
    const availableList = fullRes.body.items.map(
      (i: { availableQuantity: number }) => i.availableQuantity,
    );
    expect(availableList).toEqual([0, 0, 4, 5]);

    // Đảm bảo vAbove (available=6) và vNoInventory (null) hoàn toàn không xuất hiện
    const itemIds = fullRes.body.items.map((i: { id: string }) => i.id);
    expect(itemIds).not.toContain(vAbove.id);
    expect(itemIds).not.toContain(vNoInventory.id);
  });
});
