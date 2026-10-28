import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CatalogEventsService } from '../src/modules/products/catalog-events.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/** Trigger that tren PostgreSQL: revision doi khi ghi, dung yen khi khong ai ghi (ADR-037). */
describe('PH-11 revision SSE doc tu sequence, khong quet catalog', () => {
  let t: TestApp;
  let revision: () => Promise<string>;
  beforeAll(async () => {
    t = await createTestApp();
    const events = t.app.get(CatalogEventsService);
    revision = () => events.revision();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('doi khi sua san pham, bien the, ton kho; khong doi khi chi doc', async () => {
    const variant = await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const start = await revision();
    await t.prisma.product.findMany();
    expect(await revision()).toBe(start);
    await t.prisma.product.update({
      where: { id: variant.productId },
      data: { name: 'Tên mới cho kiểm thử' },
    });
    const renamed = await revision();
    expect(renamed).not.toBe(start);
    await t.prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: '1000' },
    });
    const repriced = await revision();
    expect(repriced).not.toBe(renamed);
    await t.prisma.inventory.create({ data: { productVariantId: variant.id, quantityOnHand: 3 } });
    expect(await revision()).not.toBe(repriced);
  });

  it('giu hang het han khong sinh ghi nao van doi revision khi qua moc het han', async () => {
    const variant = await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } });
    const user = await t.prisma.user.create({
      data: { email: 'revision@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    const order = await t.prisma.order.create({
      data: {
        userId: user.id,
        customerEmail: user.email,
        orderCode: 'FRTESTREVISION01',
        status: 'PENDING_PAYMENT',
        shippingAddressSnapshot: {},
        subtotalAmount: '1000',
        discountAmount: '0',
        shippingFeeAmount: '0',
        totalAmount: '1000',
      },
    });
    await t.prisma.inventoryReservation.create({
      data: {
        orderId: order.id,
        productVariantId: variant.id,
        quantity: 1,
        expiresAt: new Date(Date.now() + 1_000),
      },
    });
    const held = await revision();
    await new Promise((done) => setTimeout(done, 1_300));
    expect(await revision()).not.toBe(held);
  });
});
