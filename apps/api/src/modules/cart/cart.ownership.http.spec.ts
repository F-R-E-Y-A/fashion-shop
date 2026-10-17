import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter.js';
import { Prisma, UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuthGuard } from '../auth/index.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';

type Cart = { id: string; userId: string | null; guestToken: string | null };
type Item = { cartId: string; productVariantId: string; quantity: number };
const userA = '00000000-0000-4000-8000-000000000001';
const userB = '00000000-0000-4000-8000-000000000002';
const variantId = '00000000-0000-4000-8000-000000000003';

// HTTP integration sans Postgres: controller, guard, JWT, pipe va service that; Prisma gia.
describe('PH-02 regression: Cart ownership (HTTP, mocked persistence)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof supertest>;
  let tokenA: string;
  let tokenB: string;
  let carts: Cart[];
  let items: Item[];
  const jwt = new JwtService({ secret: 'cart-ownership-test-secret-only' });
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        [userA, userB].includes(where.id)
          ? {
              id: where.id,
              email: 'test@freya.vn',
              status: UserStatus.ACTIVE,
              authVersion: 0,
              userRoles: [],
            }
          : null,
      ),
    },
    cart: {
      findFirst: vi.fn(
        async ({ where }: { where: Partial<Cart> }) =>
          carts.find((cart) =>
            Object.entries(where).every(([key, value]) => cart[key as keyof Cart] === value),
          ) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { guestToken: string } }) =>
          carts.find((cart) => cart.guestToken === where.guestToken) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<Cart, 'id'> }) => {
        if (
          carts.some(
            (cart) =>
              (data.userId && cart.userId === data.userId) ||
              (data.guestToken && cart.guestToken === data.guestToken),
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('unique', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const cart = { id: `cart-${carts.length}`, ...data };
        carts.push(cart);
        return cart;
      }),
    },
    cartItem: {
      findMany: vi.fn(async ({ where }: { where: { cartId: string } }) =>
        items.filter((item) => item.cartId === where.cartId),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { cartId_productVariantId: Omit<Item, 'quantity'> } }) => {
          const key = where.cartId_productVariantId;
          return (
            items.find(
              (item) =>
                item.cartId === key.cartId && item.productVariantId === key.productVariantId,
            ) ?? null
          );
        },
      ),
      upsert: vi.fn(
        async ({
          create,
          update,
        }: {
          create: Item;
          update: { quantity: { increment: number } };
        }) => {
          const existing = items.find(
            (item) =>
              item.cartId === create.cartId && item.productVariantId === create.productVariantId,
          );
          if (existing) existing.quantity += update.quantity.increment;
          else items.push({ ...create });
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { cartId_productVariantId: Omit<Item, 'quantity'> };
          data: { quantity: number };
        }) => {
          const key = where.cartId_productVariantId;
          const item = items.find(
            (item) => item.cartId === key.cartId && item.productVariantId === key.productVariantId,
          );
          if (!item) throw new Error('missing item');
          item.quantity = data.quantity;
        },
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { cartId: string; productVariantId?: string } }) => {
          items = items.filter(
            (item) =>
              !(
                item.cartId === where.cartId &&
                (!where.productVariantId || item.productVariantId === where.productVariantId)
              ),
          );
        },
      ),
    },
    productVariant: { findUnique: vi.fn(async () => null) },
  };

  const database = {
    ...prisma,
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (run: (client: unknown) => Promise<unknown>) => run(database)),
  };

  beforeAll(async () => {
    const guard = new AuthGuard(
      prisma as unknown as PrismaService,
      {
        verifyAccessToken: (token: string) => jwt.verifyAsync(token),
      } as unknown as ConstructorParameters<typeof AuthGuard>[1],
    );
    const module = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        CartService,
        OptionalAuthGuard,
        { provide: AuthGuard, useValue: guard },
        { provide: PrismaService, useValue: database },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(guard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    http = supertest(app.getHttpServer());
    tokenA = await jwt.signAsync({ sub: userA, ver: 0 });
    tokenB = await jwt.signAsync({ sub: userB, ver: 0 });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    carts = [
      { id: 'account-b', userId: userB, guestToken: 'legacy-token-b' },
      { id: 'guest', userId: null, guestToken: 'guest-token' },
    ];
    items = [{ cartId: 'account-b', productVariantId: variantId, quantity: 7 }];
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['guest', 'account'] as const)(
    '%s CRUD tao, doc, sua va xoa chi trong gio rieng',
    async (owner) => {
      const headers =
        owner === 'guest'
          ? { 'x-guest-token': 'guest-token' }
          : { Authorization: `Bearer ${tokenA}`, 'x-guest-token': 'guest-token' };
      const first = await http.get('/api/cart').set(headers).expect(200);
      const cartId = first.body.cartId;
      await http.post('/api/cart/items').set(headers).send({ variantId, quantity: 2 }).expect(201);
      const read = await http.get('/api/cart').set(headers).expect(200);
      expect(read.body).toMatchObject({ cartId, itemCount: 2 });
      const updated = await http
        .patch(`/api/cart/items/${variantId}`)
        .set(headers)
        .send({ quantity: 3 })
        .expect(200);
      expect(updated.body.itemCount).toBe(3);
      await http.delete(`/api/cart/items/${variantId}`).set(headers).expect(200);
      await http.post('/api/cart/items').set(headers).send({ variantId, quantity: 1 }).expect(201);
      await http.delete('/api/cart').set(headers).expect(200);
      expect((await http.get('/api/cart').set(headers).expect(200)).body.itemCount).toBe(0);
      expect(items.filter((item) => item.cartId === 'account-b')).toEqual([
        { cartId: 'account-b', productVariantId: variantId, quantity: 7 },
      ]);
      if (owner === 'account')
        expect(carts.find((cart) => cart.id === cartId)).toMatchObject({
          userId: userA,
          guestToken: null,
        });
    },
  );

  it('user A khong doc/sua/xoa gio B qua token legacy hoac header user gia mao', async () => {
    const headers = {
      Authorization: `Bearer ${tokenA}`,
      'x-guest-token': 'legacy-token-b',
      'x-user-id': userB,
    };
    const own = await http.get('/api/cart').set(headers).expect(200);
    expect(own.body.cartId).not.toBe('account-b');
    expect(own.body.items).toEqual([]);
    await http
      .patch(`/api/cart/items/${variantId}`)
      .set(headers)
      .send({ quantity: 99 })
      .expect(404);
    await http.delete(`/api/cart/items/${variantId}`).set(headers).expect(200);
    await http.delete('/api/cart').set(headers).expect(200);
    await http.post('/api/cart/items').set(headers).send({ variantId, quantity: 2 }).expect(201);
    expect(items.find((item) => item.cartId === 'account-b')?.quantity).toBe(7);
    expect(carts.find((cart) => cart.userId === userA)?.guestToken).toBeNull();
  });

  it.each(['read', 'add', 'update', 'remove', 'clear'] as const)(
    'guest %s voi token account legacy bi chan 409 khong mat gio',
    async (operation) => {
      const requests = {
        read: () => http.get('/api/cart'),
        add: () => http.post('/api/cart/items').send({ variantId, quantity: 1 }),
        update: () => http.patch(`/api/cart/items/${variantId}`).send({ quantity: 99 }),
        remove: () => http.delete(`/api/cart/items/${variantId}`),
        clear: () => http.delete('/api/cart'),
      };
      await requests[operation]().set('x-guest-token', 'legacy-token-b').expect(409);
      expect(carts).toHaveLength(2);
      expect(items).toEqual([{ cartId: 'account-b', productVariantId: variantId, quantity: 7 }]);
    },
  );

  it('chu B van doc va sua gio legacy bang JWT cua B', async () => {
    const headers = { Authorization: `Bearer ${tokenB}` };
    expect((await http.get('/api/cart').set(headers).expect(200)).body.cartId).toBe('account-b');
    await http.patch(`/api/cart/items/${variantId}`).set(headers).send({ quantity: 3 }).expect(200);
    expect(carts[0]).toMatchObject({ userId: userB, guestToken: 'legacy-token-b' });
  });

  it.each(['', 'Bearer', 'Bearer invalid', 'Basic invalid', 'Bearer a b'])(
    'Authorization %s khong downgrade thanh guest',
    async (authorization) => {
      await http
        .get('/api/cart')
        .set('Authorization', authorization)
        .set('x-guest-token', 'guest-token')
        .expect(401);
      expect(prisma.cart.findFirst).not.toHaveBeenCalled();
    },
  );

  it('JWT hop le nhung principal khong ton tai bi chan 401', async () => {
    const token = await jwt.signAsync({ sub: 'missing', ver: 0 });
    await http
      .get('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .set('x-guest-token', 'guest-token')
      .expect(401);
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });

  it('guest token sai dinh dang bi chan 400', async () => {
    await http.get('/api/cart').set('x-guest-token', 'invalid token').expect(400);
    expect(prisma.cart.findFirst).not.toHaveBeenCalled();
  });
});
