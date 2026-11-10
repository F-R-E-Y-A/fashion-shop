import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { CatalogEventsService } from '../src/modules/products/catalog-events.service.js';
import { type ImportProductRow, ProductsService } from '../src/modules/products/index.js';
import * as statusLock from '../src/modules/products/product-status.js';
import { PRODUCTS } from './fixtures/catalog-products.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('UC-04.2 admin product content HTTP PostgreSQL', () => {
  let t: TestApp;
  let token: string;
  let customer: string;
  let id: string;
  let row: ImportProductRow;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const path = () => `/api/admin/products/${id}/content`;
  const body = (extra = {}) => ({
    name: row.name,
    description: null,
    material: null,
    careInstructions: null,
    expectedVersion: 0,
    ...extra,
  });
  const save = (extra = {}) => t.http.patch(path()).set(auth()).send(body(extra));
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
      data: {
        email: 'admin.content@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-only',
      },
    });
    await grantAdminRole(t.prisma, user.email);
    token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: user.authVersion });
    const buyer = await t.prisma.user.create({
      data: {
        email: 'customer.content@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-only',
      },
    });
    customer = await t.app.get(JwtService).signAsync({ sub: buyer.id, ver: buyer.authVersion });
    const p = await t.prisma.product.findUniqueOrThrow({
      where: { slug: PRODUCTS[0]!.slug },
      include: { variants: { include: { size: true, color: true } }, images: true },
    });
    id = p.id;
    await t.prisma.product.update({
      where: { id },
      data: {
        description: null,
        material: null,
        careInstructions: null,
      },
    });
    const v = p.variants[0]!;
    row = {
      sourceKey: 'admin77:existing',
      name: p.name,
      categorySlug: 'ao-thun',
      images: p.images.map((image) => ({ url: image.url })),
      variants: [
        {
          sku: v.sku,
          sizeCode: v.size.code,
          color: { code: v.color.code, name: v.color.name },
          listPrice: v.listPrice.toString(),
        },
      ],
    };
  });

  it('UC-04.2/AC19 auth truoc validation va allowlist no-store', async () => {
    await t.http.patch('/api/admin/products/bad/content').send({ bad: true }).expect(401);
    await t.http
      .patch('/api/admin/products/bad/content')
      .set('Authorization', `Bearer ${customer}`)
      .send({ bad: true })
      .expect(403);
    const result = await save({ name: 'Tên quản trị' }).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(Object.keys(result.body).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'material',
        'careInstructions',
        'contentVersion',
        'adminContentFields',
      ].sort(),
    );
    await t.http.patch('/api/admin/products/bad/content').set(auth()).send(body()).expect(400);
    await t.http
      .patch(`/api/admin/products/${randomUUID()}/content`)
      .set(auth())
      .send(body())
      .expect(404);
  });
  it.each([
    { name: '' },
    { name: '   ' },
    { name: null },
    { name: 3 },
    { name: ['x'] },
    { name: 'x'.repeat(201) },
    { description: 'x'.repeat(20001) },
    { material: 'x'.repeat(501) },
    { careInstructions: 'x'.repeat(5001) },
    { description: {} },
    { expectedVersion: '0' },
    { expectedVersion: -1 },
    { expectedVersion: 0.5 },
    { expectedVersion: 2147483648 },
    { slug: 'other' },
    { adminContentFields: [] },
    { statusVersion: 3 },
    { name: undefined },
    { description: undefined },
    { material: undefined },
    { careInstructions: undefined },
    { expectedVersion: undefined },
    { name: 'Tên có \0 NUL' },
    { description: 'Mô tả có \0 NUL' },
    { material: 'Chất liệu có \0 NUL' },
    { careInstructions: 'Bảo quản có \0 NUL' },
  ])('UC-04.2/AC19 invalid body %o khong ghi', async (extra) => {
    const before = await state();
    await save(extra).expect(400);
    expect(await state()).toEqual(before);
  });
  it('UC-04.2/AC20 normalize nullable va gioi han, detail/public/search/revision phan anh', async () => {
    const before = await state();
    const events = t.app.get(CatalogEventsService);
    const revBefore = await events.revision();
    const result = await save({
      name: '  Tên mới đặc biệt  ',
      description: ' mô tả ',
      material: ' ',
      careInstructions: ' giặt tay ',
    }).expect(200);
    expect(result.body).toMatchObject({
      name: 'Tên mới đặc biệt',
      description: 'mô tả',
      material: null,
      careInstructions: 'giặt tay',
      contentVersion: 1,
      adminContentFields: ['name', 'description', 'careInstructions'],
    });
    expect(await events.revision()).not.toBe(revBefore);
    const detail = await t.http.get(`/api/admin/products/${id}`).set(auth()).expect(200);
    expect(detail.body).toMatchObject(result.body);
    const publicDetail = await t.http.get(`/api/products/${before.slug}`).expect(200);
    expect(publicDetail.body).toMatchObject({ name: 'Tên mới đặc biệt', description: 'mô tả' });
    expect(publicDetail.body).not.toHaveProperty('adminContentFields');
    expect(publicDetail.body).not.toHaveProperty('contentVersion');
    const searchRes = await t.http
      .get('/api/products')
      .query({ search: 'Tên mới đặc biệt' })
      .expect(200);
    expect(searchRes.body.items.some((p: { id: string }) => p.id === id)).toBe(true);
    const suggestRes = await t.http
      .get('/api/search/suggest')
      .query({ q: 'Tên mới đặc biệt' })
      .expect(200);
    expect(suggestRes.body.products.some((p: { id: string }) => p.id === id)).toBe(true);
    await save({
      name: 'x'.repeat(200),
      description: 'x'.repeat(20000),
      material: 'x'.repeat(500),
      careInstructions: 'x'.repeat(5000),
      expectedVersion: 1,
    }).expect(200);
  });
  it('UC-04.2/AC21 no-op giu version timestamp revision va bao ve; ABA khong chap nhan', async () => {
    const before = await state();
    const events = t.app.get(CatalogEventsService);
    const revBefore = await events.revision();
    expect((await save().expect(200)).body.contentVersion).toBe(0);
    expect(await state()).toEqual(before);
    expect(await events.revision()).toBe(revBefore);
    await save({ name: 'Đổi' }).expect(200);
    await save({ expectedVersion: 1 }).expect(200);
    await save({ name: 'cũ', expectedVersion: 0 }).expect(409);
    expect(await state()).toMatchObject({
      name: row.name,
      contentVersion: 2,
      adminContentFields: ['name'],
    });
  });
  it('UC-04.2/AC21 hai admin cung version chi mot ghi', async () => {
    const result = await Promise.all([save({ name: 'A' }), save({ name: 'B' })]);
    expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await state()).toMatchObject({ contentVersion: 1 });
  });
  it('UC-04.2/AC22 import giu tung truong sua ke ca null va cap nhat truong khac', async () => {
    await save({ name: 'Quản trị', description: 'Mô tả', material: 'cotton' }).expect(200);
    await save({
      name: 'Quản trị',
      description: null,
      material: 'cotton',
      expectedVersion: 1,
    }).expect(200);
    const input = {
      ...row,
      name: 'Nguồn',
      description: 'Nguồn mô tả',
      material: 'linen',
      careInstructions: 'Nguồn bảo quản',
    };
    await importer().importProducts([input]);
    expect(await state()).toMatchObject({
      name: 'Quản trị',
      description: null,
      material: 'cotton',
      careInstructions: 'Nguồn bảo quản',
      contentVersion: 3,
      adminContentFields: ['name', 'description', 'material'],
    });
    await importer().importProducts([input]);
    expect(await state()).toMatchObject({ contentVersion: 3 });
    await save({
      name: 'Quản trị',
      material: 'cotton',
      careInstructions: 'Nguồn bảo quản',
      expectedVersion: 2,
    }).expect(409);
  });
  it.each(['admin', 'import'] as const)(
    'UC-04.2/AC22 khoa hang that: %s truoc khong mat noi dung',
    async (first) => {
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const resume = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = statusLock.lockProductStatus;
      let calls = 0;
      const spy = vi.spyOn(statusLock, 'lockProductStatus').mockImplementation(async (...args) => {
        const result = await original(...args);
        if (++calls === 1) {
          enter();
          await resume;
        }
        return result;
      });
      const runImport = () => importer().importProducts([{ ...row, name: 'Nguồn mới' }]);
      const runAdmin = () => Promise.resolve(save({ name: 'Quản trị' }));
      const a = first === 'admin' ? runAdmin() : runImport();
      await entered;
      const b = first === 'admin' ? runImport() : runAdmin();
      try {
        await vi.waitFor(async () => {
          const locked = await t.prisma.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`;
          expect(Number(locked[0]?.count)).toBeGreaterThan(0);
        });
      } finally {
        release();
      }
      const result = await Promise.all([a, b]);
      spy.mockRestore();
      if (first === 'admin')
        expect(await state()).toMatchObject({ name: 'Quản trị', contentVersion: 1 });
      else {
        expect((result[1] as { status: number }).status).toBe(409);
        await save({ name: 'Quản trị', expectedVersion: 1 }).expect(200);
        expect(await state()).toMatchObject({ name: 'Quản trị', contentVersion: 2 });
      }
    },
  );
  it('UC-04.2/AC23 slug hold status gia bien the anh snapshot don cu va rollback giu nguyen', async () => {
    const before = await state();
    const variants = await t.prisma.productVariant.findMany({ where: { productId: id } });
    const images = await t.prisma.productImage.findMany({ where: { productId: id } });
    const order = await t.prisma.order.create({
      data: {
        orderCode: 'ORD-EDIT77-001',
        customerEmail: 'customer.content@example.test',
        status: 'CONFIRMED',
        shippingAddressSnapshot: { recipientName: 'Khách test' },
        subtotalAmount: '199000',
        discountAmount: '0',
        shippingFeeAmount: '0',
        totalAmount: '199000',
        items: {
          create: {
            productVariantId: variants[0]!.id,
            quantity: 1,
            unitPrice: variants[0]!.listPrice,
            productSnapshot: { productName: before.name, sku: variants[0]!.sku },
          },
        },
      },
      include: { items: true },
    });
    await save({ name: 'Tên mới', description: 'mới' }).expect(200);
    const after = await state();
    expect(after).toMatchObject({
      slug: before.slug,
      priceFrom: before.priceFrom,
      isActive: before.isActive,
      adminDisabled: before.adminDisabled,
      statusVersion: before.statusVersion,
    });
    expect(await t.prisma.productVariant.findMany({ where: { productId: id } })).toEqual(variants);
    expect(await t.prisma.productImage.findMany({ where: { productId: id } })).toEqual(images);
    expect(await t.prisma.orderItem.findMany({ where: { orderId: order.id } })).toEqual(
      order.items,
    );
  });
});
