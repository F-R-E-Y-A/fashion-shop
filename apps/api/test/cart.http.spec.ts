import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Cart HTTP API (PH-02 Gio hang)', () => {
  let t: TestApp;
  let variantId: string;
  const guestToken = 'guest-test-token-12345';

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);

    const variant = await t.prisma.productVariant.findFirst();
    if (!variant) throw new Error('Khong tim thay bien the mau trong CSDL sau khi seed');
    variantId = variant.id;
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/cart tra ve gio trong khi chua them san pham', async () => {
    const res = await t.http.get('/api/cart').set('x-guest-token', guestToken).expect(200);

    expect(res.body).toMatchObject({
      items: [],
      total: '0.00',
      itemCount: 0,
    });
  });

  it('GET /api/cart tra ve 400 khi thieu header dinh danh', async () => {
    await t.http.get('/api/cart').expect(400);
  });

  it('POST /api/cart/items them bien the vao gio', async () => {
    const res = await t.http
      .post('/api/cart/items')
      .set('x-guest-token', guestToken)
      .send({ variantId, quantity: 2 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      variantId,
      quantity: 2,
    });
    expect(res.body.itemCount).toBe(2);
  });

  it('POST /api/cart/items them trung thi cong don so luong', async () => {
    const res = await t.http
      .post('/api/cart/items')
      .set('x-guest-token', guestToken)
      .send({ variantId, quantity: 3 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(5);
    expect(res.body.itemCount).toBe(5);
  });

  it('PATCH /api/cart/items/:variantId sua so luong', async () => {
    const res = await t.http
      .patch(`/api/cart/items/${variantId}`)
      .set('x-guest-token', guestToken)
      .send({ quantity: 1 })
      .expect(200);

    expect(res.body.items[0].quantity).toBe(1);
    expect(res.body.itemCount).toBe(1);
  });

  it('DELETE /api/cart/items/:variantId xoa mot dong', async () => {
    const res = await t.http
      .delete(`/api/cart/items/${variantId}`)
      .set('x-guest-token', guestToken)
      .expect(200);

    expect(res.body.items).toHaveLength(0);
    expect(res.body.itemCount).toBe(0);
  });

  it('DELETE /api/cart xoa toan bo gio', async () => {
    // Them lai roi xoa ca gio
    await t.http
      .post('/api/cart/items')
      .set('x-guest-token', guestToken)
      .send({ variantId, quantity: 1 })
      .expect(201);

    await t.http.delete('/api/cart').set('x-guest-token', guestToken).expect(200);

    const res = await t.http.get('/api/cart').set('x-guest-token', guestToken).expect(200);

    expect(res.body.items).toHaveLength(0);
  });
});
