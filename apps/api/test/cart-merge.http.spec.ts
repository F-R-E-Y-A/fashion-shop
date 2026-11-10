import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Prisma, UserStatus } from '../src/generated/prisma/client.js';
import { createCartTestApp } from './helpers/create-cart-test-app.js';
import { resetDatabase } from './helpers/db.js';

// PostgreSQL, JWT, AuthGuard, controller va CartService that; khong can Redis/SMTP.
describe('PH-02 regression: merge atomically with real PostgreSQL', () => {
  let t: Awaited<ReturnType<typeof createCartTestApp>>;
  let variants: string[];

  beforeAll(async () => {
    t = await createCartTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    variants = (await t.prisma.productVariant.findMany({ take: 2, orderBy: { id: 'asc' } })).map(
      (variant) => variant.id,
    );
    expect(variants).toHaveLength(2);
  });
  afterAll(async () => {
    await t?.app.close();
  });

  async function account(label: string) {
    const user = await t.prisma.user.create({
      data: {
        email: `${label}@cart.test`,
        passwordHash: 'not-for-login',
        status: UserStatus.ACTIVE,
      },
    });
    return {
      id: user.id,
      headers: { Authorization: `Bearer ${await t.tokens.signAccessToken(user.id, 0)}` },
    };
  }

  function guest(token = 'guest-token', quantity = 2) {
    return t.prisma.cart.create({
      data: {
        guestToken: token,
        items: { create: { productVariantId: variants[0]!, quantity } },
      },
    });
  }

  function merge(user: Awaited<ReturnType<typeof account>>, token = 'guest-token') {
    return t.http.post('/api/cart/merge').set(user.headers).set('x-guest-token', token);
  }

  async function stored(userId: string) {
    return t.prisma.cart.findUnique({ where: { userId }, include: { items: true } });
  }

  it('CRUD PostgreSQL tach guest va account ngay request dau, khong doi chu hay sua gio khac', async () => {
    const a = await account('crud');
    const source = await guest();
    const first = await t.http
      .get('/api/cart')
      .set(a.headers)
      .set('x-guest-token', 'guest-token')
      .expect(200);
    expect(first.body.cartId).not.toBe(source.id);
    expect(first.body.items).toEqual([]);
    expect((await stored(a.id))?.guestToken).toBeNull();
    const headers = { ...a.headers, 'x-guest-token': 'guest-token' };
    await t.http
      .post('/api/cart/items')
      .set(headers)
      .send({ variantId: variants[0], quantity: 3 })
      .expect(201);
    expect(
      (
        await t.http
          .patch(`/api/cart/items/${variants[0]}`)
          .set(headers)
          .send({ quantity: 4 })
          .expect(200)
      ).body.itemCount,
    ).toBe(4);
    await t.http.delete(`/api/cart/items/${variants[0]}`).set(headers).expect(200);
    await t.http
      .post('/api/cart/items')
      .set(headers)
      .send({ variantId: variants[0], quantity: 1 })
      .expect(201);
    await t.http.delete('/api/cart').set(headers).expect(200);
    expect((await t.http.get('/api/cart').set(headers).expect(200)).body.itemCount).toBe(0);
    expect(await t.prisma.cartItem.findMany({ where: { cartId: source.id } })).toMatchObject([
      { quantity: 2 },
    ]);
    await t.http
      .get('/api/cart')
      .set('Authorization', '')
      .set('x-guest-token', 'guest-token')
      .expect(401);
  });

  it('gop variants trung va rieng, xoa nguon, retry tuan tu khong cong lai', async () => {
    const a = await account('merge');
    const source = await guest();
    await t.prisma.cartItem.create({
      data: { cartId: source.id, productVariantId: variants[1]!, quantity: 4 },
    });
    await t.prisma.cart.create({
      data: { userId: a.id, items: { create: { productVariantId: variants[0]!, quantity: 3 } } },
    });
    const first = await merge(a).expect(201);
    expect(first.body.itemCount).toBe(9);
    expect(first.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId: variants[0], quantity: 5 }),
        expect.objectContaining({ variantId: variants[1], quantity: 4 }),
      ]),
    );
    expect(await t.prisma.cart.findUnique({ where: { id: source.id } })).toBeNull();
    expect((await merge(a).expect(201)).body).toEqual(first.body);
    expect((await stored(a.id))?.guestToken).toBeNull();
  });

  it.each([false, true])(
    'token legacy (cung account: %s) tra 409, khong thay doi gio nao',
    async (same) => {
      const a = await account('a');
      const owner = same ? a : await account('b');
      const legacy = await t.prisma.cart.create({
        data: {
          userId: owner.id,
          guestToken: 'legacy-token',
          items: { create: { productVariantId: variants[0]!, quantity: 7 } },
        },
      });
      await merge(a, 'legacy-token').expect(409);
      expect(
        await t.prisma.cart.findUnique({ where: { id: legacy.id }, include: { items: true } }),
      ).toMatchObject({
        userId: owner.id,
        guestToken: 'legacy-token',
        items: [{ quantity: 7 }],
      });
      if (!same) expect(await stored(a.id)).toBeNull();
    },
  );

  it('8 merge dong thoi cung nguon/dich chi cong mot lan va khong 500', async () => {
    const a = await account('same-owner');
    await guest();
    const replies = await Promise.all(Array.from({ length: 8 }, () => merge(a)));
    expect(replies.map((reply) => reply.status)).toEqual(Array(8).fill(201));
    expect((await stored(a.id))?.items).toMatchObject([{ quantity: 2 }]);
    expect(await t.prisma.cart.count({ where: { guestToken: 'guest-token' } })).toBe(0);
  });

  it('hai account tranh mot nguon: chi mot account nhan hang', async () => {
    const a = await account('a');
    const b = await account('b');
    await guest();
    expect((await Promise.all([merge(a), merge(b)])).map((reply) => reply.status)).toEqual([
      201, 201,
    ]);
    const counts = await Promise.all([stored(a.id), stored(b.id)]);
    expect(
      counts.map((cart) => cart!.items.reduce((sum, item) => sum + item.quantity, 0)).sort(),
    ).toEqual([0, 2]);
  });

  it('hai nguon merge dong thoi cung account chua co gio: mot dich, du hang', async () => {
    const a = await account('two-sources');
    await guest('guest-one', 2);
    await guest('guest-two', 3);
    const replies = await Promise.all([merge(a, 'guest-one'), merge(a, 'guest-two')]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    expect(await t.prisma.cart.count({ where: { userId: a.id } })).toBe(1);
    expect((await stored(a.id))?.items).toMatchObject([{ quantity: 5 }]);
  });

  it('loi sau khi ghi va xoa nguon van rollback ca dich moi va nguon', async () => {
    const a = await account('rollback');
    const source = await guest();
    const original = t.prisma.$transaction.bind(t.prisma);
    const failBeforeCommit = async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      original(async (tx) => {
        await run(tx);
        throw new Error('injected error before commit');
      });
    const spy = vi
      .spyOn(t.prisma, '$transaction')
      .mockImplementationOnce(failBeforeCommit as unknown as typeof t.prisma.$transaction);
    try {
      await merge(a).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await stored(a.id)).toBeNull();
    expect(
      await t.prisma.cart.findUnique({ where: { id: source.id }, include: { items: true } }),
    ).toMatchObject({
      userId: null,
      guestToken: 'guest-token',
      items: [{ quantity: 2 }],
    });
    expect((await merge(a).expect(201)).body.itemCount).toBe(2);
  });

  it('tran so luong tra 409 va giu nguyen ca hai gio', async () => {
    const a = await account('overflow');
    const source = await guest();
    await t.prisma.cart.create({
      data: {
        userId: a.id,
        items: { create: { productVariantId: variants[0]!, quantity: 2_147_483_647 } },
      },
    });
    await merge(a).expect(409);
    expect((await stored(a.id))?.items).toMatchObject([{ quantity: 2_147_483_647 }]);
    expect(
      await t.prisma.cart.findUnique({ where: { id: source.id }, include: { items: true } }),
    ).toMatchObject({ items: [{ quantity: 2 }] });
  });

  it('guest add va merge dong thoi khong mat/copy trung hang hoac loi FK', async () => {
    const a = await account('concurrent-add');
    for (let iteration = 0; iteration < 5; iteration += 1) {
      await t.prisma.cart.deleteMany();
      await guest();
      const replies = await Promise.all([
        t.http
          .post('/api/cart/items')
          .set('x-guest-token', 'guest-token')
          .send({ variantId: variants[0], quantity: 1 }),
        merge(a),
      ]);
      expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
      // Hai thu tu hop le: add truoc merge -> 3 account; merge truoc add -> 2 account + 1 guest moi.
      const all = await t.prisma.cartItem.findMany();
      expect(all.reduce((sum, item) => sum + item.quantity, 0)).toBe(3);
    }
  });

  it('khong co nguon, nguon rong va thieu header la no-op; token sai 400, chua auth 401', async () => {
    const a = await account('empty');
    await merge(a, 'absent-token').expect(201);
    await t.prisma.cart.create({ data: { guestToken: 'empty-token' } });
    expect((await merge(a, 'empty-token').expect(201)).body.itemCount).toBe(0);
    await t.http.post('/api/cart/merge').set(a.headers).expect(201);
    for (const token of ['', 'invalid token', 'x'.repeat(65)]) await merge(a, token).expect(400);
    await t.http.post('/api/cart/merge').set('x-guest-token', 'absent-token').expect(401);
    await t.http
      .post('/api/cart/merge')
      .set('Authorization', 'Bearer invalid')
      .set('x-guest-token', 'absent-token')
      .expect(401);
  });

  it('guest CRUD bi chan voi token legacy, principal hop le van truy cap dung gio minh', async () => {
    const a = await account('legacy-crud');
    await t.prisma.cart.create({
      data: {
        userId: a.id,
        guestToken: 'legacy-token',
        items: { create: { productVariantId: variants[0]!, quantity: 7 } },
      },
    });
    const requests = [
      t.http.get('/api/cart'),
      t.http.post('/api/cart/items').send({ variantId: variants[0], quantity: 1 }),
      t.http.patch(`/api/cart/items/${variants[0]}`).send({ quantity: 9 }),
      t.http.delete(`/api/cart/items/${variants[0]}`),
      t.http.delete('/api/cart'),
    ];
    for (const request of requests) await request.set('x-guest-token', 'legacy-token').expect(409);
    expect(
      (
        await t.http
          .get('/api/cart')
          .set(a.headers)
          .set('x-guest-token', 'invalid token')
          .expect(200)
      ).body.itemCount,
    ).toBe(7);
  });
});
