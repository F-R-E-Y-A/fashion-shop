import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { priceFromOf, PRODUCTS } from '../prisma/seed/catalog.seed.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/**
 * Kiem thu qua HTTP THAT: dung ca AppModule, goi bang supertest vao Postgres kiem thu.
 * Kiem ca ba thu ma kiem thu don vi khong thay: ValidationPipe, AllExceptionsFilter va prefix /api.
 * Nam ca loi da kiem tay hom 13/09 nay thanh bai tu dong.
 */
describe('GET /api/products (UC-03.1 Khám phá sản phẩm)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('UC-03.1/AC1 trả danh sách phân trang', async () => {
    const res = await t.http.get('/api/products').expect(200);

    expect(res.body).toMatchObject({
      total: PRODUCTS.length,
      page: 1,
      pageSize: 12,
      totalPages: Math.ceil(PRODUCTS.length / 12),
    });
    expect(res.body.items).toHaveLength(Math.min(PRODUCTS.length, 12));
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        slug: expect.any(String),
        price: expect.any(String),
        categoryName: expect.any(String),
      }),
    );
  });

  it('UC-03.1/AC1 loc theo danh muc bang categorySlug', async () => {
    // San pham nam o danh muc la; loc ca danh muc con (UC-03.1/AC1) la viec cua PH-01.
    const expected = PRODUCTS.filter((p) => p.categorySlug === 'ao-thun').length;

    const res = await t.http.get('/api/products').query({ categorySlug: 'ao-thun' }).expect(200);

    expect(res.body.total).toBe(expected);
    const items = res.body.items as { categorySlug: string }[];
    expect(items.every((item) => item.categorySlug === 'ao-thun')).toBe(true);
  });

  it('UC-03.2/AC2 tim theo ten khong phan biet hoa thuong', async () => {
    const expected = PRODUCTS.filter((p) => p.name.toLowerCase().includes('quan')).length;

    const res = await t.http.get('/api/products').query({ search: 'QUAN' }).expect(200);

    expect(res.body.total).toBe(expected);
  });

  it('UC-03.4/AC1 xem chi tiet theo slug', async () => {
    const first = PRODUCTS[0];

    const res = await t.http.get(`/api/products/${first.slug}`).expect(200);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: first.name,
      categorySlug: first.categorySlug,
    });
    // Gia la price_from: gia ban thap nhat, tinh ca gia khuyen mai (ADR-007).
    expect(Number(res.body.price)).toBe(priceFromOf(first));
    expect(res.body).toMatchObject({
      brandName: expect.any(String),
      breadcrumb: expect.arrayContaining([expect.objectContaining({ slug: first.categorySlug })]),
      colors: expect.any(Array),
      images: expect.any(Array),
      variants: expect.any(Array),
    });
    expect(res.body.variants.length).toBeGreaterThan(0);
  });

  it('UC-03.1/AC1 lọc danh mục gốc gồm cả ba nhóm áo con', async () => {
    const res = await t.http
      .get('/api/products')
      .query({ categorySlug: 'ao', pageSize: 60 })
      .expect(200);
    const slugs = (res.body.items as Array<{ categorySlug: string }>).map(
      (item) => item.categorySlug,
    );
    expect(slugs).toContain('ao-thun');
    expect(slugs).toContain('ao-so-mi');
    expect(slugs).toContain('ao-khoac');
    expect(slugs.every((slug) => ['ao-thun', 'ao-so-mi', 'ao-khoac'].includes(slug))).toBe(true);
  });

  it('featured=false không lọc, true chỉ trả nổi bật', async () => {
    const all = await t.http.get('/api/products').query({ pageSize: 60 }).expect(200);
    const noFilter = await t.http
      .get('/api/products')
      .query({ featured: 'false', pageSize: 60 })
      .expect(200);
    const featured = await t.http
      .get('/api/products')
      .query({ featured: 'true', pageSize: 60 })
      .expect(200);
    expect(noFilter.body.total).toBe(all.body.total);
    expect(featured.body.total).toBe(PRODUCTS.filter((product) => product.isFeatured).length);
    await t.http.get('/api/products').query({ featured: 'maybe' }).expect(400);
  });

  it.each(['price_asc', 'price_desc'] as const)('sort=%s sắp đúng giá bán', async (sort) => {
    const res = await t.http.get('/api/products').query({ sort, pageSize: 60 }).expect(200);
    const prices = (res.body.items as Array<{ price: string }>).map((item) => Number(item.price));
    const expected = [...prices].sort((a, b) => (sort === 'price_asc' ? a - b : b - a));
    expect(prices).toEqual(expected);
  });

  it('hai trang không trùng sản phẩm', async () => {
    const first = await t.http.get('/api/products').query({ page: 1, pageSize: 5 }).expect(200);
    const second = await t.http.get('/api/products').query({ page: 2, pageSize: 5 }).expect(200);
    const ids = [...first.body.items, ...second.body.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('related cùng danh mục, không chứa sản phẩm hiện tại', async () => {
    const first = PRODUCTS[0];
    const res = await t.http.get(`/api/products/${first.slug}/related`).expect(200);
    const rows = res.body as Array<{ slug: string; categorySlug: string }>;
    expect(rows.every((row) => row.slug !== first.slug)).toBe(true);
    expect(rows.every((row) => row.categorySlug === first.categorySlug)).toBe(true);
  });

  describe('truong hop loi tra dung khuon ApiErrorBody', () => {
    it('404 khi slug khong ton tai', async () => {
      const res = await t.http.get('/api/products/khong-ton-tai').expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        path: '/api/products/khong-ton-tai',
      });
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('400 khi slug dài hơn giới hạn DTO', async () => {
      await t.http.get(`/api/products/${'x'.repeat(501)}`).expect(400);
    });

    it.each([
      ['page = 0', { page: 0 }],
      ['page khong phai so', { page: 'abc' }],
      ['pageSize vuot 60', { pageSize: 999 }],
      ['gui truong la', { foo: 'bar' }],
    ])('400 khi %s', async (_label, params) => {
      const res = await t.http.get('/api/products').query(params).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
      expect(Array.isArray(res.body.message)).toBe(true);
    });
  });
});
