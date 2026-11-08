import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { PRODUCTS } from './fixtures/catalog-products.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const EMAIL = 'admin.catalog@example.test';
const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
interface Summary {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

describe('UC-04.2 admin products HTTP thật', () => {
  let t: TestApp;
  let token: string;
  let target: { id: string; slug: string; categoryId: string };
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    const session = await authFlows(t).activateAndLogin(EMAIL);
    await grantAdminRole(t.prisma, EMAIL);
    token = session.accessToken;
    target = await t.prisma.product.findUniqueOrThrow({
      where: { slug: PRODUCTS[0]!.slug },
      select: { id: true, slug: true, categoryId: true },
    });
  });
  const get = (path = '') =>
    t.http.get(`/api/admin/products${path}`).set('Authorization', `Bearer ${token}`);

  it('UC-04.2/AC1 guard trước validation cho list và detail', async () => {
    const customer = await authFlows(t).activateAndLogin('customer.catalog@example.test');
    for (const path of ['?status=bad', '/not-a-uuid']) {
      await t.http.get(`/api/admin/products${path}`).expect(401);
      await t.http
        .get(`/api/admin/products${path}`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .expect(403);
    }
    await get().expect(200);
  });
  it('UC-04.2/AC2 thấy product/category/variant ẩn, không thay luật storefront', async () => {
    await t.prisma.product.update({ where: { id: target.id }, data: { isActive: false } });
    await t.prisma.category.update({ where: { id: target.categoryId }, data: { isActive: false } });
    await t.prisma.productVariant.updateMany({
      where: { productId: target.id },
      data: { isActive: false },
    });
    await t.http.get(`/api/products/${target.slug}`).expect(404);
    const result = await get(`/${target.id}`).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toMatchObject({
      id: target.id,
      isActive: false,
      category: { isActive: false },
    });
    expect(result.body.variants.length).toBeGreaterThan(1);
    expect(result.body.variants.every((v: { isActive: boolean }) => !v.isActive)).toBe(true);
    const list = await get('?status=inactive').expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(target.id);
    await t.http.get(`/api/products/${target.slug}`).expect(404);
  });
  it('UC-04.2/AC2 active product không có biến thể active vẫn thấy được', async () => {
    await t.prisma.productVariant.updateMany({
      where: { productId: target.id },
      data: { isActive: false },
    });
    const result = await get('?status=active&pageSize=60').expect(200);
    expect(result.body.items.some((p: Summary) => p.id === target.id)).toBe(true);
    await t.http.get(`/api/products/${target.slug}`).expect(404);
  });
  it('UC-04.2/AC2 Decimal, null, ảnh có thứ tự và allowlist DTO', async () => {
    await t.prisma.product.update({
      where: { id: target.id },
      data: { brandId: null, attributes: { secret: 'must-not-leak' } },
    });
    const result = await get(`/${target.id}`).expect(200);
    expect(result.body.brand).toBeNull();
    expect(typeof result.body.priceFrom).toBe('string');
    expect(
      result.body.variants.every(
        (v: { listPrice: unknown; salePrice: unknown }) =>
          typeof v.listPrice === 'string' &&
          (v.salePrice === null || typeof v.salePrice === 'string'),
      ),
    ).toBe(true);
    expect(result.body).not.toHaveProperty('attributes');
    expect(result.body).not.toHaveProperty('categoryId');
    expect(result.body.images.map((img: { sortOrder: number }) => img.sortOrder)).toEqual(
      [...result.body.images.map((img: { sortOrder: number }) => img.sortOrder)].sort(
        (a: number, b: number) => a - b,
      ),
    );
    await t.prisma.productImage.deleteMany({ where: { productId: target.id } });
    expect((await get(`/${target.id}`).expect(200)).body).toMatchObject({
      imageUrl: null,
      images: [],
    });
  });
  it('UC-04.2/AC3 tìm trước phân trang theo tên/SKU mọi biến thể, không trùng', async () => {
    await t.prisma.product.update({
      where: { id: target.id },
      data: { name: 'Áo Cần Tìm', createdAt: new Date('2020-01-01Z') },
    });
    await t.prisma.productVariant.updateMany({
      where: { productId: target.id },
      data: { isActive: false },
    });
    const variants = await t.prisma.productVariant.findMany({
      where: { productId: target.id },
      take: 2,
    });
    for (const [i, v] of variants.entries())
      await t.prisma.productVariant.update({ where: { id: v.id }, data: { sku: `AN-SKU-${i}` } });
    expect((await get('?pageSize=1').expect(200)).body.items[0].id).not.toBe(target.id);
    for (const q of ['áo cần tìm', 'an-sku']) {
      const result = await get().query({ q, pageSize: 1 }).expect(200);
      expect(result.body).toMatchObject({ total: 1, items: [{ id: target.id }] });
    }
    expect((await get().query({ q: 'ao can tim' }).expect(200)).body.total).toBe(0);
  });
  it.each(['%', '_', '\\'])('UC-04.2/AC3 ký tự literal %s không thành wildcard', async (q) => {
    await t.prisma.product.update({
      where: { id: target.id },
      data: { name: `literal${q}marker` },
    });
    const result = await get().query({ q }).expect(200);
    expect(result.body).toMatchObject({ total: 1, items: [{ id: target.id }] });
  });
  it('UC-04.2/AC4 lọc kết hợp/sort/page/total và thứ tự phá hòa', async () => {
    await t.prisma.product.updateMany({ data: { createdAt: new Date('2026-01-01Z') } });
    const first = await get('?sort=newest&pageSize=12').expect(200);
    const second = await get('?sort=newest&pageSize=12&page=2').expect(200);
    const ids = [...first.body.items, ...second.body.items].map((p: Summary) => p.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(PRODUCTS.length);
    expect(first.body).toMatchObject({
      total: PRODUCTS.length,
      totalPages: 2,
      page: 1,
      pageSize: 12,
    });
    const filtered = await get()
      .query({ q: PRODUCTS[0]!.name, status: 'active', sort: 'name_asc', pageSize: 24 })
      .expect(200);
    expect(filtered.body).toMatchObject({ total: 1, items: [{ id: target.id }] });
    expect((await get('?page=9').expect(200)).body).toMatchObject({
      items: [],
      page: 9,
      total: PRODUCTS.length,
    });
  });
  it.each([
    'q=a&q=b',
    'page=1&page=1',
    'pageSize=12&pageSize=12',
    'status=all&status=all',
    'sort=newest&sort=newest',
    'page=1e2',
    'page=1.5',
    'page=0',
    'page=Infinity',
    'page=100001',
    'pageSize=61',
    'status=hidden',
    'sort=invalid',
    'unknown=x',
  ])('UC-04.2/AC4 input sai %s trả 400', async (raw) => {
    const result = await get(`?${raw}`).expect(400);
    expect(result.body).toMatchObject({ code: 'BAD_REQUEST', statusCode: 400 });
  });
  it('UC-04.2/AC4 UUID sai/không tồn tại phân biệt 400/404', async () => {
    await get('/bad-id').expect(400);
    await get(`/${missing}`).expect(404);
  });
  it('UC-04.2/AC8 GET không đổi dữ liệu và không mở mutation', async () => {
    const before = await t.prisma.product.findUniqueOrThrow({ where: { id: target.id } });
    await get().expect(200);
    await get(`/${target.id}`).expect(200);
    expect(await t.prisma.product.findUniqueOrThrow({ where: { id: target.id } })).toEqual(before);
    await t.http
      .post(`/api/admin/products/${target.id}/hide`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
