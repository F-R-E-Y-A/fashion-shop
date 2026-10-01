import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authFlows } from './helpers/auth-flow.js';
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

  describe('Khach vang lai (guest cart)', () => {
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

  describe('Nguoi dung dang nhap (authenticated user cart)', () => {
    it('nhan dien user tu JWT Bearer token va bo qua x-user-id gia mao', async () => {
      const flows = authFlows(t);
      const user = await flows.activateAndLogin('cart-user@freya.vn');

      // Lay gio hang ban dau bang Bearer token
      const initialRes = await t.http
        .get('/api/cart')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(initialRes.body.items).toHaveLength(0);

      // Them san pham vao gio cua user (khi client co the gui header x-user-id gia mao cua nguoi khac)
      const fakeOtherUserId = '00000000-0000-0000-0000-000000000999';
      const addRes = await t.http
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .set('x-user-id', fakeOtherUserId)
        .send({ variantId, quantity: 2 })
        .expect(201);

      expect(addRes.body.items).toHaveLength(1);
      expect(addRes.body.items[0].quantity).toBe(2);

      // Kiem tra trong DB: cart thuc su thuoc ve user.id chu khong phai fakeOtherUserId
      const dbCart = await t.prisma.cart.findFirst({
        where: { userId: user.id },
        include: { items: true },
      });
      expect(dbCart).toBeDefined();
      expect(dbCart?.items).toHaveLength(1);

      const fakeCart = await t.prisma.cart.findFirst({
        where: { userId: fakeOtherUserId },
      });
      expect(fakeCart).toBeNull();
    });

    it('POST /api/cart/merge yeu cau xac thuc AuthGuard va gop gio dung cach', async () => {
      const flows = authFlows(t);
      const mergeUser = await flows.activateAndLogin('cart-merge-user@freya.vn');
      const tempGuestToken = 'merge-guest-token-67890';

      // Khach them hang truoc khi login
      await t.http
        .post('/api/cart/items')
        .set('x-guest-token', tempGuestToken)
        .send({ variantId, quantity: 3 })
        .expect(201);

      // Goi merge khong co token se bi 401 Unauthorized
      await t.http.post('/api/cart/merge').set('x-guest-token', tempGuestToken).expect(401);

      // Goi merge co Bearer token thanh cong
      const mergeRes = await t.http
        .post('/api/cart/merge')
        .set('Authorization', `Bearer ${mergeUser.accessToken}`)
        .set('x-guest-token', tempGuestToken)
        .expect(201);

      expect(mergeRes.body.items).toHaveLength(1);
      expect(mergeRes.body.items[0].quantity).toBe(3);

      // Gio hang khach da duoc xoa
      const remainingGuestCart = await t.prisma.cart.findFirst({
        where: { guestToken: tempGuestToken },
      });
      expect(remainingGuestCart).toBeNull();
    });
  });
});
