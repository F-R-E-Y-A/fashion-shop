import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { applyStockCounts } from '../src/modules/inventory/index.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/** Cong cu kiem ke `npm run stock:import`: ghi qua cung khoa variant voi Checkout, tat ca hoac khong. */
describe('Inventory stock count import (PostgreSQL)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let skus: { id: string; sku: string }[];

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    skus = await t.prisma.productVariant.findMany({
      select: { id: true, sku: true },
      orderBy: { sku: 'asc' },
      take: 2,
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('đặt tồn theo số kiểm kê, ghi ADJUSTMENT theo chênh lệch; chạy lại không đổi', async () => {
    const [a, b] = skus;
    await t.prisma.inventory.create({ data: { productVariantId: b!.id, quantityOnHand: 7 } });
    const counts = [
      { sku: a!.sku, quantity: 5 },
      { sku: b!.sku, quantity: 3 },
    ];
    const result = await applyStockCounts(t.prisma, counts);
    expect(result).toMatchObject({
      outcome: 'APPLIED',
      changes: [
        { sku: a!.sku, before: null, after: 5 },
        { sku: b!.sku, before: 7, after: 3 },
      ],
    });
    const movements = await t.prisma.stockMovement.findMany({ orderBy: { quantityDelta: 'asc' } });
    expect(movements.map((m) => [m.productVariantId, m.movementType, m.quantityDelta])).toEqual([
      [b!.id, 'ADJUSTMENT', -4],
      [a!.id, 'ADJUSTMENT', 5],
    ]);

    await applyStockCounts(t.prisma, counts);
    expect(await t.prisma.stockMovement.count()).toBe(2);
  });

  it('dry-run và SKU lạ không ghi dòng nào', async () => {
    const dry = await applyStockCounts(t.prisma, [{ sku: skus[0]!.sku, quantity: 4 }], {
      dryRun: true,
    });
    expect(dry.outcome).toBe('DRY_RUN');
    const rejected = await applyStockCounts(t.prisma, [
      { sku: skus[0]!.sku, quantity: 4 },
      { sku: 'KHONG-CO', quantity: 1 },
    ]);
    expect(rejected).toEqual({ outcome: 'REJECTED', errors: ['SKU KHONG-CO khong ton tai.'] });
    expect(await t.prisma.inventory.count()).toBe(0);
    expect(await t.prisma.stockMovement.count()).toBe(0);
  });

  it('từ chối số nhỏ hơn lượng đang giữ cho đơn chờ thanh toán', async () => {
    const variant = skus[0]!;
    await t.prisma.inventory.create({ data: { productVariantId: variant.id, quantityOnHand: 5 } });
    const order = await t.prisma.order.create({
      data: {
        orderCode: 'FRSTOCKCOUNT',
        customerEmail: 'stock@fixture.test',
        status: 'PENDING_PAYMENT',
        shippingAddressSnapshot: {},
        subtotalAmount: '0',
        discountAmount: '0',
        shippingFeeAmount: '0',
        totalAmount: '0',
      },
    });
    await t.prisma.inventoryReservation.create({
      data: {
        orderId: order.id,
        productVariantId: variant.id,
        quantity: 3,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const result = await applyStockCounts(t.prisma, [{ sku: variant.sku, quantity: 2 }]);
    expect(result.outcome).toBe('REJECTED');
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variant.id } }))
        .quantityOnHand,
    ).toBe(5);
    expect((await applyStockCounts(t.prisma, [{ sku: variant.sku, quantity: 3 }])).outcome).toBe(
      'APPLIED',
    );
  });
});
