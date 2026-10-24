import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryService } from '../src/modules/inventory/index.js';
import { ProductsService } from '../src/modules/products/index.js';
import { createCartTestApp } from './helpers/create-cart-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('PH-11: Cart doc gia/ton that, khong giu hang', () => {
  let t: Awaited<ReturnType<typeof createCartTestApp>>;
  let id: string;
  const headers = { 'x-guest-token': 'live-cart-test' };
  const read = () => t.http.get('/api/cart').set(headers).expect(200);
  const patch = (data: object) => t.http.patch(`/api/cart/items/${id}`).set(headers).send(data);
  const stock = (quantityOnHand: number) =>
    t.prisma.inventory.update({ where: { productVariantId: id }, data: { quantityOnHand } });
  const add = (quantity = 2) =>
    t.http.post('/api/cart/items').set(headers).send({ variantId: id, quantity });

  beforeAll(async () => {
    t = await createCartTestApp();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetDatabase(t.prisma);
    id = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
    await t.prisma.productVariant.update({
      where: { id },
      data: { listPrice: '449000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: id, quantityOnHand: 10 } });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await t?.app.close();
  });

  it('lay listPrice khi salePrice null; chon dong tinh tien, discount mac dinh 0', async () => {
    const result = await add().expect(201);
    expect(result.body).toMatchObject({
      total: '898000.00',
      discountAmount: '0.00',
      itemCount: 2,
      selectedItemCount: 2,
    });
    expect(result.body.items[0]).toMatchObject({
      price: '449000',
      isSelected: true,
      availability: 'AVAILABLE',
      availableQuantity: 10,
    });
    expect((await patch({ isSelected: false }).expect(200)).body).toMatchObject({
      total: '0.00',
      itemCount: 2,
      selectedItemCount: 0,
    });
    expect((await read()).body.items[0].isSelected).toBe(false);
    expect((await patch({ isSelected: true }).expect(200)).body.total).toBe('898000.00');
    expect(await t.prisma.inventoryReservation.count()).toBe(0);
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: id } }))
        .quantityOnHand,
    ).toBe(10);
  });

  it('gia thay doi duoc doc lai, khong dong bang gia luc them', async () => {
    await add().expect(201);
    await t.prisma.productVariant.update({ where: { id }, data: { salePrice: '329000' } });
    expect((await read()).body).toMatchObject({
      total: '658000.00',
      items: [expect.objectContaining({ price: '329000' })],
    });
  });

  it('Catalog detail va list cung hien gia bien the hien tai va ton kha dung', async () => {
    const variant = await t.prisma.productVariant.findUniqueOrThrow({
      where: { id },
      include: { product: true },
    });
    await t.prisma.productVariant.updateMany({
      where: { productId: variant.productId },
      data: { listPrice: '449000', salePrice: null },
    });
    const detail = await t.http.get(`/api/products/${variant.product.slug}`).expect(200);
    expect(detail.body.price).toBe('449000');
    expect(detail.body.variants.find((v: { id: string }) => v.id === id)).toMatchObject({
      availableQuantity: 10,
      price: '449000',
    });
    const list = await t.http
      .get('/api/products')
      .query({ search: variant.product.name, log: false })
      .expect(200);
    expect(list.body.items.find((p: { id: string }) => p.id === variant.productId)).toMatchObject({
      price: '449000',
      stockStatus: 'IN_STOCK',
    });
  });

  it('SSE route public mo stream that va thay doi revision khi gia thay doi', async () => {
    const controller = new AbortController();
    const response = await fetch(`${await t.app.getUrl()}/api/products/events`, {
      signal: controller.signal,
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    async function nextRevision(): Promise<string> {
      let pending = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error('SSE closed before revision');
        pending += decoder.decode(value, { stream: true });
        const match = pending.match(/"revision":"([a-f0-9]+)"/);
        if (match) return match[1]!;
      }
    }
    try {
      const first = await nextRevision();
      await t.prisma.productVariant.update({ where: { id }, data: { salePrice: '123000' } });
      expect(await nextRevision()).not.toBe(first);
    } finally {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });

  it('het hang giu nguyen dong/quantity, bo chon ben vung va khong tu chon khi co hang lai', async () => {
    await add().expect(201);
    await stock(0);
    const result = await read();
    expect(result.body).toMatchObject({
      itemCount: 2,
      total: '0.00',
      items: [
        expect.objectContaining({ quantity: 2, availability: 'OUT_OF_STOCK', isSelected: false }),
      ],
    });
    expect(await t.prisma.cartItem.count()).toBe(1);
    await patch({ isSelected: true }).expect(200);
    await stock(10);
    expect((await read()).body.items[0]).toMatchObject({
      availability: 'AVAILABLE',
      isSelected: false,
    });
  });

  it('ton giam duoi quantity khong cat quantity; sua giam thi mua duoc', async () => {
    await add(5).expect(201);
    await stock(3);
    expect((await read()).body).toMatchObject({
      total: '0.00',
      items: [
        expect.objectContaining({
          quantity: 5,
          availability: 'INSUFFICIENT_STOCK',
          canCheckout: false,
        }),
      ],
    });
    expect((await patch({ quantity: 3 }).expect(200)).body.total).toBe('1347000.00');
  });

  it('ngung ban product cha giu dong, chan them moi', async () => {
    await add().expect(201);
    const variant = await t.prisma.productVariant.findUniqueOrThrow({ where: { id } });
    await t.prisma.product.update({ where: { id: variant.productId }, data: { isActive: false } });
    expect((await read()).body.items[0]).toMatchObject({
      isActive: false,
      availability: 'INACTIVE',
      isSelected: false,
    });
    await add().expect(400);
  });

  it('khong co inventory la UNKNOWN, khong gia thanh het hang hay ton duong', async () => {
    await t.prisma.inventory.delete({ where: { productVariantId: id } });
    const result = await add().expect(201);
    expect(result.body).toMatchObject({
      total: '0.00',
      items: [
        expect.objectContaining({
          availability: 'UNKNOWN',
          availableQuantity: null,
          canCheckout: false,
        }),
      ],
    });
  });

  it('dang nhap gop gio van giu dong guest da bo chon', async () => {
    await add().expect(201);
    await patch({ isSelected: false }).expect(200);
    const user = await t.prisma.user.create({
      data: { email: 'selected@cart.test', passwordHash: 'test-only', status: 'ACTIVE' },
    });
    const token = await t.tokens.signAccessToken(user.id, 0);
    const result = await t.http
      .post('/api/cart/merge')
      .set(headers)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(result.body).toMatchObject({
      itemCount: 2,
      selectedItemCount: 0,
      total: '0.00',
      items: [expect.objectContaining({ isSelected: false, quantity: 2 })],
    });
    expect(
      await t.prisma.cart.findUnique({ where: { guestToken: headers['x-guest-token'] } }),
    ).toBeNull();
  });

  it('khong cho them moi qua ton, hoac bien the khong ton tai', async () => {
    await add(11).expect(409);
    expect(await t.prisma.cartItem.count()).toBe(0);
    await t.http
      .post('/api/cart/items')
      .set(headers)
      .send({ variantId: '00000000-0000-4000-8000-000000000000', quantity: 1 })
      .expect(404);
    await stock(0);
    await add(1).expect(409);
  });

  it.each([
    {},
    { quantity: null },
    { isSelected: null },
    { isSelected: 'true' },
    { quantity: 0 },
    { quantity: 2_147_483_648 },
    { voucherCode: 'LATE' },
  ])('PATCH tu choi body sai %j', async (body) => {
    await add().expect(201);
    await patch(body).expect(400);
    expect((await read()).body.items[0].quantity).toBe(2);
  });

  it('Catalog loi sau khi ghi thi rollback them hang, khong tra mock hay cong don khi retry', async () => {
    const products = t.app.get(ProductsService);
    const spy = vi.spyOn(products, 'getVariantsForCart');
    const original = products.getVariantsForCart.bind(products);
    spy
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('injected Catalog failure'));
    await add().expect(500);
    expect(await t.prisma.cartItem.count()).toBe(0);
    spy.mockRestore();
    expect((await add().expect(201)).body.itemCount).toBe(2);
  });

  it('ton kha dung tru reservation con han; bo qua da release/het han', async () => {
    const order = await t.prisma.order.create({
      data: {
        orderCode: 'HOLD-TEST',
        customerEmail: 'hold@test.local',
        status: 'PENDING_CONFIRMATION',
        shippingAddressSnapshot: {},
        subtotalAmount: 0,
        discountAmount: 0,
        shippingFeeAmount: 0,
        totalAmount: 0,
      },
    });
    const reservation = await t.prisma.inventoryReservation.create({
      data: {
        orderId: order.id,
        productVariantId: id,
        quantity: 7,
        createdAt: new Date(Date.now() - 120_000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const inventory = t.app.get(InventoryService);
    expect((await inventory.getAvailableQuantities([id])).get(id)).toBe(3);
    await t.prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: new Date() },
    });
    expect((await inventory.getAvailableQuantities([id])).get(id)).toBe(10);
    await t.prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { releasedAt: null, expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await inventory.getAvailableQuantities([id])).get(id)).toBe(10);
  });
});
