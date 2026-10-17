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

  // PostgreSQL that, AuthModule that; chi chay tren CSDL dung xong bo da xac minh.
  describe('PH-02 regression: ownership voi PostgreSQL', () => {
    it('request dau sau login khong trung unique token guest va khong luu token vao account', async () => {
      const token = 'ownership-existing-guest';
      const guest = await t.http.get('/api/cart').set('x-guest-token', token).expect(200);
      const user = await authFlows(t).activateAndLogin('cart-ownership-first@freya.vn');
      const account = await t.http
        .get('/api/cart')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .set('x-guest-token', token)
        .expect(200);
      expect(account.body.cartId).not.toBe(guest.body.cartId);
      expect(await t.prisma.cart.findUnique({ where: { userId: user.id } })).toMatchObject({
        guestToken: null,
      });
      expect(await t.prisma.cart.findUnique({ where: { guestToken: token } })).toMatchObject({
        id: guest.body.cartId,
        userId: null,
      });
    });

    it('legacy mixed row tu choi guest CRUD bang 409 va giu nguyen du lieu cho chu account', async () => {
      const user = await authFlows(t).activateAndLogin('cart-ownership-legacy@freya.vn');
      const legacy = await t.prisma.cart.create({
        data: {
          userId: user.id,
          guestToken: 'ownership-legacy',
          items: { create: { productVariantId: variantId, quantity: 7 } },
        },
      });
      const requests = [
        t.http.get('/api/cart'),
        t.http.post('/api/cart/items').send({ variantId, quantity: 1 }),
        t.http.patch(`/api/cart/items/${variantId}`).send({ quantity: 99 }),
        t.http.delete(`/api/cart/items/${variantId}`),
        t.http.delete('/api/cart'),
      ];
      for (const request of requests) {
        await request.set('x-guest-token', 'ownership-legacy').expect(409);
      }
      const owner = await t.http
        .get('/api/cart')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);
      expect(owner.body).toMatchObject({ cartId: legacy.id, itemCount: 7 });
      expect(await t.prisma.cart.findUnique({ where: { id: legacy.id } })).toMatchObject({
        userId: user.id,
        guestToken: 'ownership-legacy',
      });
    });

    it('user A khong doc hoac ghi gio B bang guest token cua B', async () => {
      const a = await authFlows(t).activateAndLogin('cart-ownership-a@freya.vn');
      const b = await authFlows(t).activateAndLogin('cart-ownership-b@freya.vn');
      const cartB = await t.prisma.cart.create({
        data: {
          userId: b.id,
          guestToken: 'ownership-token-b',
          items: { create: { productVariantId: variantId, quantity: 7 } },
        },
      });
      const headers = {
        Authorization: `Bearer ${a.accessToken}`,
        'x-guest-token': 'ownership-token-b',
        'x-user-id': b.id,
      };
      const own = await t.http.get('/api/cart').set(headers).expect(200);
      expect(own.body.items).toEqual([]);
      await t.http
        .patch(`/api/cart/items/${variantId}`)
        .set(headers)
        .send({ quantity: 99 })
        .expect(404);
      await t.http.delete(`/api/cart/items/${variantId}`).set(headers).expect(200);
      await t.http.delete('/api/cart').set(headers).expect(200);
      await t.http
        .post('/api/cart/items')
        .set(headers)
        .send({ variantId, quantity: 2 })
        .expect(201);
      expect(await t.prisma.cartItem.findMany({ where: { cartId: cartB.id } })).toMatchObject([
        { quantity: 7 },
      ]);
    });

    it('invalid Bearer cung guest token khong downgrade ve guest', async () => {
      await t.http
        .get('/api/cart')
        .set('Authorization', 'Bearer invalid')
        .set('x-guest-token', guestToken)
        .expect(401);
    });
  });
});
