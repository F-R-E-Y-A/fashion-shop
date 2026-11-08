import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { type ImportProductRow, ProductsService } from '../src/modules/products/index.js';
import * as statusLock from '../src/modules/products/product-status.js';
import { PRODUCTS } from './fixtures/catalog-products.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('UC-04.2 admin product status HTTP PostgreSQL', () => {
  let t: TestApp;
  let token: string;
  let customer: string;
  let userId: string;
  let id: string;
  let variantId: string;
  let row: ImportProductRow;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const change = (adminDisabled: boolean, expectedVersion: number, productId = id) =>
    t.http
      .patch(`/api/admin/products/${productId}/status`)
      .set(auth())
      .send({ adminDisabled, expectedVersion });
  const state = () => t.prisma.product.findUniqueOrThrow({ where: { id } });
  const importer = () => t.app.get(ProductsService);
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    const user = await t.prisma.user.create({
      data: { email: 'admin.status@example.test', status: 'ACTIVE', passwordHash: 'test-only' },
    });
    userId = user.id;
    await grantAdminRole(t.prisma, user.email);
    token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: user.authVersion });
    const buyer = await t.prisma.user.create({
      data: { email: 'customer.status@example.test', status: 'ACTIVE', passwordHash: 'test-only' },
    });
    customer = await t.app.get(JwtService).signAsync({ sub: buyer.id, ver: buyer.authVersion });
    const p = await t.prisma.product.findUniqueOrThrow({
      where: { slug: PRODUCTS[0]!.slug },
      include: { variants: { include: { size: true, color: true } }, images: true },
    });
    id = p.id;
    const variant = p.variants[0]!;
    variantId = variant.id;
    row = {
      sourceKey: 'admin65:existing',
      name: p.name,
      categorySlug: 'ao-thun',
      images: p.images.map((image) => ({ url: image.url })),
      variants: [
        {
          sku: variant.sku,
          sizeCode: variant.size.code,
          color: { code: variant.color.code, name: variant.color.name },
          listPrice: variant.listPrice.toString(),
        },
      ],
    };
  });

  it('UC-04.2/AC11 auth truoc validation, no-store va allowlist', async () => {
    await t.http.patch('/api/admin/products/bad/status').send({ bad: true }).expect(401);
    await t.http
      .patch('/api/admin/products/bad/status')
      .set('Authorization', `Bearer ${customer}`)
      .send({ bad: true })
      .expect(403);
    const result = await change(true, 0).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body).sort()).toEqual(
      ['id', 'name', 'isActive', 'adminDisabled', 'statusVersion'].sort(),
    );
    expect(result.body).toMatchObject({
      id,
      adminDisabled: true,
      isActive: false,
      statusVersion: 1,
    });
    const detail = await t.http.get(`/api/admin/products/${id}`).set(auth()).expect(200);
    expect(detail.body).toMatchObject({ adminDisabled: true, statusVersion: 1 });
    expect(detail.body).not.toHaveProperty('attributes');
  });
  it.each([
    {},
    { adminDisabled: true },
    { adminDisabled: 'false', expectedVersion: 0 },
    { adminDisabled: 1, expectedVersion: 0 },
    { adminDisabled: null, expectedVersion: 0 },
    { adminDisabled: false, expectedVersion: '0' },
    { adminDisabled: false, expectedVersion: -1 },
    { adminDisabled: false, expectedVersion: 0.5 },
    { adminDisabled: false, expectedVersion: 2147483648 },
    { adminDisabled: true, expectedVersion: 0, extra: true },
  ])('UC-04.2/AC11 body sai %j tra400 khong ghi', async (body) => {
    await t.http.patch(`/api/admin/products/${id}/status`).set(auth()).send(body).expect(400);
    expect(await state()).toMatchObject({ adminDisabled: false, statusVersion: 0, isActive: true });
  });
  it('UC-04.2/AC11 UUID400 va thieu404', async () => {
    await change(true, 0, 'bad').expect(400);
    await change(true, 0, randomUUID()).expect(404);
  });
  it('UC-04.2/AC12 hai huong/no-op/ABA va nguon khong anh', async () => {
    await change(true, 0).expect(200);
    const unchanged = await state();
    expect((await change(true, 1).expect(200)).body.statusVersion).toBe(1);
    expect(await state()).toEqual(unchanged);
    expect((await change(false, 1).expect(200)).body).toMatchObject({
      adminDisabled: false,
      isActive: true,
      statusVersion: 2,
    });
    await change(true, 0).expect(409);
    await change(true, 2).expect(200);
    await importer().importProducts([{ ...row, images: [] }]);
    expect((await change(false, 3).expect(200)).body).toMatchObject({
      adminDisabled: false,
      isActive: false,
      statusVersion: 4,
    });
    expect((await change(false, 4).expect(200)).body.statusVersion).toBe(4);
  });
  it('UC-04.2/AC12 hai admin cung version chi mot thanh cong', async () => {
    const results = await Promise.all([change(true, 0), change(true, 0)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await state()).toMatchObject({ adminDisabled: true, statusVersion: 1 });
  });
  it('UC-04.2/AC13 import lap/co-khong anh giu hold va version', async () => {
    await change(true, 0).expect(200);
    for (const images of [row.images, [], row.images]) {
      const result = await importer().importProducts([{ ...row, images }]);
      expect(result[0]?.status).toBe('updated');
      expect(await state()).toMatchObject({
        adminDisabled: true,
        isActive: false,
        statusVersion: 1,
      });
    }
    await change(false, 1).expect(200);
    await importer().importProducts([{ ...row, images: [] }]);
    expect(await state()).toMatchObject({
      adminDisabled: false,
      isActive: false,
      statusVersion: 3,
    });
    await importer().importProducts([row]);
    await importer().importProducts([row]);
    expect(await state()).toMatchObject({ adminDisabled: false, isActive: true, statusVersion: 4 });
  });
  it.each(['admin', 'import'] as const)(
    'UC-04.2/AC13 khoa hang thuc: %s truoc, khong mat hold',
    async (first) => {
      let entered!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = statusLock.lockProductStatus;
      let calls = 0;
      const spy = vi.spyOn(statusLock, 'lockProductStatus').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++calls === 1) {
          entered();
          await resume;
        }
        return result;
      });
      const runImport = () => importer().importProducts([row]);
      const runAdmin = () => Promise.resolve(change(true, 0).expect(200));
      const a = first === 'admin' ? runAdmin() : runImport();
      await locked;
      const b = first === 'admin' ? runImport() : runAdmin();
      try {
        await vi.waitFor(async () => {
          const blocked = await t.prisma.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`;
          expect(Number(blocked[0]?.count)).toBeGreaterThan(0);
        });
      } finally {
        release();
      }
      await Promise.all([a, b]);
      spy.mockRestore();
      expect(await state()).toMatchObject({
        adminDisabled: true,
        isActive: false,
        statusVersion: 1,
      });
    },
  );

  async function prepareCheckout() {
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'QA65', name: 'Tỉnh test', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'QA6501', name: 'Phường test', level: 'COMMUNE', parentId: province.id },
    });
    const address = await t.prisma.address.create({
      data: {
        userId,
        administrativeAreaId: commune.id,
        recipientName: 'Khách test',
        phone: '0901234567',
        detailAddress: 'Địa chỉ test',
      },
    });
    await seedShipping(t.prisma);
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 10 } });
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 1 }).expect(201);
    return address.id;
  }
  async function history() {
    return Promise.all([
      t.prisma.order.findMany(),
      t.prisma.orderItem.findMany(),
      t.prisma.orderStatusHistory.findMany(),
      t.prisma.payment.findMany(),
      t.prisma.paymentTransaction.findMany(),
      t.prisma.inventory.findMany(),
      t.prisma.inventoryReservation.findMany(),
      t.prisma.stockMovement.findMany(),
    ]);
  }
  it('UC-04.2/AC14 public/giỏ/quote sau ngung ban, bat lai khong chon/bat category-variant', async () => {
    const addressId = await prepareCheckout();
    const before = await state();
    await change(true, 0).expect(200);
    await t.http.get(`/api/products/${before.slug}`).expect(404);
    for (const query of [{}, { search: before.name }]) {
      const result = await t.http
        .get('/api/products')
        .query({ ...query, pageSize: 60 })
        .expect(200);
      expect(result.body.items.some((p: { id: string }) => p.id === id)).toBe(false);
      expect(JSON.stringify(result.body)).not.toContain('adminDisabled');
    }
    const suggest = await t.http.get('/api/search/suggest').query({ q: before.name }).expect(200);
    expect(suggest.body.products.some((p: { id: string }) => p.id === id)).toBe(false);
    const cart = await t.http.get('/api/cart').set(auth()).expect(200);
    expect(cart.body.items[0]).toMatchObject({ availability: 'INACTIVE', isSelected: false });
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 1 }).expect(400);
    await t.http.post('/api/checkout/preview').set(auth()).send({ addressId }).expect(422);
    await t.prisma.category.update({ where: { id: before.categoryId }, data: { isActive: false } });
    await t.prisma.productVariant.updateMany({
      where: { productId: id },
      data: { isActive: false },
    });
    await change(false, 1).expect(200);
    expect((await t.http.get('/api/cart').set(auth()).expect(200)).body.items[0].isSelected).toBe(
      false,
    );
    expect(await t.prisma.category.findUnique({ where: { id: before.categoryId } })).toMatchObject({
      isActive: false,
    });
    expect(
      (await t.prisma.productVariant.findMany({ where: { productId: id } })).every(
        (v) => !v.isActive,
      ),
    ).toBe(true);
    await t.http.get(`/api/products/${before.slug}`).expect(404);
  });
  it('UC-04.2/AC14 don COD da tao va stock/reservation/payment/history giu nguyen ca hai huong', async () => {
    const addressId = await prepareCheckout();
    const quote = await t.http
      .post('/api/checkout/preview')
      .set(auth())
      .send({ addressId })
      .expect(201);
    await t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({
        addressId,
        fingerprint: quote.body.fingerprint,
        gateway: 'COD',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const before = await history();
    expect(before[0].length).toBe(1);
    await change(true, 0).expect(200);
    expect(await history()).toEqual(before);
    await change(false, 1).expect(200);
    expect(await history()).toEqual(before);
  });
  it.each(['preview', 'orders'])(
    'UC-04.2/AC14 %s doc catalog truoc ngung ban giu snapshot, lan doc sau bi chan',
    async (operation) => {
      const addressId = await prepareCheckout();
      const input =
        operation === 'orders'
          ? {
              addressId,
              gateway: 'COD',
              idempotencyKey: randomUUID(),
              fingerprint: (
                await t.http
                  .post('/api/checkout/preview')
                  .set(auth())
                  .send({ addressId })
                  .expect(201)
              ).body.fingerprint,
            }
          : { addressId };
      const checkout = t.app.get(ProductsService);
      const original = checkout.getVariantsForCart.bind(checkout);
      let read!: () => void;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        read = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = vi
        .spyOn(checkout, 'getVariantsForCart')
        .mockImplementationOnce(async (...args) => {
          const result = await original(...args);
          read();
          await resume;
          return result;
        });
      const pending = Promise.resolve(
        t.http.post(`/api/checkout/${operation}`).set(auth()).send(input),
      );
      await gate;
      try {
        await change(true, 0).expect(200);
      } finally {
        release();
      }
      expect((await pending).status).toBe(201);
      spy.mockRestore();
      const later = await t.http
        .post('/api/checkout/preview')
        .set(auth())
        .send({ addressId })
        .expect(operation === 'orders' ? 409 : 422);
      if (operation === 'orders') expect(later.body.code).toBe('PENDING_ORDER_EXISTS');
      expect((await t.http.get('/api/cart').set(auth()).expect(200)).body.items[0]).toMatchObject({
        availability: 'INACTIVE',
        isSelected: false,
      });
    },
  );
});
