import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { priceFromOf, PRODUCTS } from '../prisma/seed/catalog.seed.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/**
 * Kiem thu qua HTTP THAT: dung ca AppModule, goi bang supertest vao Postgres kiem thu.
 * Kiem ca ba thu ma kiem thu don vi khong thay: ValidationPipe, AllExceptionsFilter va prefix /api.
 * Nam ca loi da kiem tay hom 13/09 nay thanh bai tu dong.
 */
describe('GET /api/products (PH-03 Kham pha san pham)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('AC-1 tra danh sach phan trang voi du 10 san pham gia', async () => {
    const res = await t.http.get('/api/products').expect(200);

    expect(res.body).toMatchObject({
      total: PRODUCTS.length,
      page: 1,
      pageSize: 12,
      totalPages: 1,
    });
    expect(res.body.items).toHaveLength(PRODUCTS.length);
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        slug: expect.any(String),
        price: expect.any(String),
        categoryName: expect.any(String),
      }),
    );
  });

  it('AC-4 loc theo danh muc bang categorySlug', async () => {
    // San pham nam o danh muc la; loc ca danh muc con (UC-03.1/AC1) la viec cua PH-01.
    const expected = PRODUCTS.filter((p) => p.categorySlug === 'ao-thun').length;

    const res = await t.http.get('/api/products').query({ categorySlug: 'ao-thun' }).expect(200);

    expect(res.body.total).toBe(expected);
    const items = res.body.items as { categorySlug: string }[];
    expect(items.every((item) => item.categorySlug === 'ao-thun')).toBe(true);
  });

  it('AC-2 tim theo ten khong phan biet hoa thuong', async () => {
    const expected = PRODUCTS.filter((p) => p.name.toLowerCase().includes('quan')).length;

    const res = await t.http.get('/api/products').query({ search: 'QUAN' }).expect(200);

    expect(res.body.total).toBe(expected);
  });

  it('AC-5 xem chi tiet theo slug', async () => {
    const first = PRODUCTS[0];

    const res = await t.http.get(`/api/products/${first.slug}`).expect(200);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      name: first.name,
      categorySlug: first.categorySlug,
    });
    // Gia la price_from: gia ban thap nhat, tinh ca gia khuyen mai (ADR-007).
    expect(Number(res.body.price)).toBe(priceFromOf(first));
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
