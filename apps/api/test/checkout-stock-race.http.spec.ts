import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { createTestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/**
 * ADR-120: ai tao don truoc giu hang truoc; khach den sau nhan 409 OUT_OF_STOCK neu ten mon,
 * khong phai cau chung chung hay "chon lai gio". Tach khoi checkout-payment.http.spec.ts.
 */
interface Buyer {
  token: string;
  addressId: string;
}

describe('PH-11 checkout: hai khách tranh đơn vị cuối (ADR-120)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let variantId: string;
  let productName: string;
  let communeId: string;
  let a: Buyer;
  let b: Buyer;

  const as = (buyer: Buyer) => ({ Authorization: `Bearer ${buyer.token}` });
  const preview = (buyer: Buyer) =>
    t.http.post('/api/checkout/preview').set(as(buyer)).send({ addressId: buyer.addressId });
  const create = (
    buyer: Buyer,
    fingerprint: string,
    gateway?: 'COD',
    items?: { variantId: string; quantity: number }[],
  ) =>
    t.http.post('/api/checkout/orders').set(as(buyer)).send({
      addressId: buyer.addressId,
      fingerprint,
      idempotencyKey: randomUUID(),
      gateway,
      items,
    });
  const lines = (quote: { items: { variantId: string; quantity: number }[] }) =>
    quote.items.map(({ variantId, quantity }) => ({ variantId, quantity }));
  // Bien the thu hai thuoc san pham khac, con nhieu hang: kiem gio nhieu mon.
  async function second() {
    const first = await t.prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const other = await t.prisma.productVariant.findFirstOrThrow({
      where: { productId: { not: first.productId } },
      orderBy: { id: 'asc' },
      include: { product: { select: { name: true } } },
    });
    await t.prisma.productVariant.update({
      where: { id: other.id },
      data: { listPrice: '150000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: other.id, quantityOnHand: 5 } });
    return { id: other.id, name: other.product.name };
  }
  const stock = (quantityOnHand: number) =>
    t.prisma.inventory.update({ where: { productVariantId: variantId }, data: { quantityOnHand } });
  const reserved = async () =>
    (
      await t.prisma.inventoryReservation.aggregate({
        where: { productVariantId: variantId, releasedAt: null },
        _sum: { quantity: true },
      })
    )._sum.quantity ?? 0;

  async function buyer(email: string, quantity = 1): Promise<Buyer> {
    const user = await t.prisma.user.create({
      data: { email, passwordHash: 'not-used', status: 'ACTIVE' },
    });
    const token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: 0 });
    const address = await t.prisma.address.create({
      data: {
        userId: user.id,
        administrativeAreaId: communeId,
        recipientName: 'Khách thử',
        phone: '0901234567',
        detailAddress: 'Địa chỉ kiểm thử',
        isDefault: true,
      },
    });
    const result = { token, addressId: address.id };
    await t.http.post('/api/cart/items').set(as(result)).send({ variantId, quantity }).expect(201);
    return result;
  }

  beforeAll(async () => {
    t = await createTestApp({
      config: {
        VNPAY_TMN_CODE: 'TESTONLY',
        VNPAY_HASH_SECRET: 'isolated-test-secret-not-a-merchant-credential',
      },
    });
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'T01', name: 'Tỉnh thử', level: 'PROVINCE' },
    });
    communeId = (
      await t.prisma.administrativeArea.create({
        data: { code: 'T0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
      })
    ).id;
    await seedShipping(t.prisma);
    const variant = await t.prisma.productVariant.findFirstOrThrow({
      orderBy: { id: 'asc' },
      include: { product: { select: { name: true } } },
    });
    variantId = variant.id;
    productName = variant.product.name;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '200000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 1 } });
    a = await buyer('a@fixture.test');
    b = await buyer('b@fixture.test');
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-07.1/AC17 cùng bấm đặt món cuối: một đơn, người sau nhận 409 OUT_OF_STOCK nêu tên món', async () => {
    const [qa, qb] = await Promise.all([preview(a).expect(201), preview(b).expect(201)]);
    const results = await Promise.all([
      create(a, qa.body.fingerprint),
      create(b, qb.body.fingerprint),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.code).toBe('OUT_OF_STOCK');
    expect(loser.body.message).toContain(productName);
    expect(loser.body.message).toContain('vừa hết hàng');
    expect(await reserved()).toBe(1);
    expect(await t.prisma.order.count()).toBe(1);
    expect(await t.prisma.payment.count()).toBe(1);
  });

  it('UC-07.1/AC17 đặt sau khi người kia đã giữ: preview và đặt bằng quote cũ đều báo OUT_OF_STOCK, không QUOTE_CHANGED', async () => {
    const stale = await preview(b).expect(201);
    await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    const view = await preview(b).expect(409);
    expect(view.body.code).toBe('OUT_OF_STOCK');
    expect(view.body.message).toContain(productName);
    // Bao gia thay het khong biet chac do khach khac hay quan tri chinh ton: khong neu nguyen nhan.
    expect(view.body.message).not.toContain('khách khác');
    const placed = await create(b, stale.body.fingerprint).expect(409);
    expect(placed.body.code).toBe('OUT_OF_STOCK');
    expect(placed.body.message).not.toContain('khách khác');
    expect(await t.prisma.order.count()).toBe(1);
    // Loi rollback viec bo chon: mon van con danh dau trong gio cua B, gio tu bo chon khi B mo gio.
    const cart = await t.http.get('/api/cart').set(as(b)).expect(200);
    expect(cart.body.items[0]).toMatchObject({ availability: 'OUT_OF_STOCK', isSelected: false });
  });

  it('UC-07.1/AC17 còn ít hơn số khách cần: thông báo nêu số còn lại', async () => {
    await stock(3);
    await t.http.patch(`/api/cart/items/${variantId}`).set(as(b)).send({ quantity: 3 }).expect(200);
    const stale = await preview(b).expect(201);
    await t.http.patch(`/api/cart/items/${variantId}`).set(as(a)).send({ quantity: 2 }).expect(200);
    await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    const placed = await create(b, stale.body.fingerprint).expect(409);
    expect(placed.body).toMatchObject({ code: 'OUT_OF_STOCK' });
    expect(placed.body.message).toContain('chỉ còn 1');
    expect(await reserved()).toBe(2);
  });

  it('UC-07.1/AC17 hold của người trước hết hạn thì người sau mua được', async () => {
    const first = await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    await preview(b).expect(409);
    const past = new Date(Date.now() - 1000);
    await t.prisma.inventoryReservation.updateMany({
      where: { orderId: first.body.id },
      data: { expiresAt: past, createdAt: new Date(past.getTime() - 15 * 60_000) },
    });
    await create(b, (await preview(b).expect(201)).body.fingerprint).expect(201);
  });

  it('UC-07.1/AC17 món cuối do đơn COD của chính khách giữ: chỉ ra đơn đó, không nói khách khác đặt', async () => {
    await create(a, (await preview(a).expect(201)).body.fingerprint, 'COD').expect(201);
    const view = await preview(a).expect(409);
    expect(view.body.code).toBe('PENDING_ORDER_EXISTS');
    expect(view.body.message).not.toContain('khách khác');
  });

  it('UC-07.1/AC17 giỏ đã tự bỏ chọn món hết (khách mở giỏ ở tab khác): đặt bằng quote cũ vẫn nêu tên món', async () => {
    const stale = (await preview(b).expect(201)).body;
    await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    await t.http.get('/api/cart').set(as(b)).expect(200);
    const placed = await create(b, stale.fingerprint, undefined, lines(stale)).expect(409);
    expect(placed.body.code).toBe('OUT_OF_STOCK');
    expect(placed.body.message).toContain(productName);
    // Client cu khong gui dong xac nhan: giu ma cu, khong doan.
    await create(b, stale.fingerprint).expect(422);
    // Web tai lai preview sau loi: gio khong con mon nao duoc chon.
    expect((await preview(b).expect(422)).body.code).toBe('SELECTION_REQUIRED');
  });

  it('UC-07.1/AC17 giỏ nhiều món, món cuối bị giữ và giỏ đã bỏ chọn: nêu đúng món hết, không QUOTE_CHANGED', async () => {
    const extra = await second();
    await t.http
      .post('/api/cart/items')
      .set(as(b))
      .send({ variantId: extra.id, quantity: 1 })
      .expect(201);
    const stale = (await preview(b).expect(201)).body;
    expect(stale.items).toHaveLength(2);
    await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    await t.http.get('/api/cart').set(as(b)).expect(200);
    const placed = await create(b, stale.fingerprint, undefined, lines(stale)).expect(409);
    expect(placed.body.code).toBe('OUT_OF_STOCK');
    expect(placed.body.message).toContain(productName);
    expect(placed.body.message).not.toContain(extra.name);
    // Web tai lai preview sau loi: chi con mon kia.
    const after = (await preview(b).expect(201)).body;
    expect(after.items.map((item: { variantId: string }) => item.variantId)).toEqual([extra.id]);
  });

  it('UC-07.1/AC17 khách tự giảm số lượng ở tab khác rồi đặt bằng quote cũ: QUOTE_CHANGED, không báo thiếu hàng', async () => {
    await stock(3);
    await t.http.patch(`/api/cart/items/${variantId}`).set(as(b)).send({ quantity: 3 }).expect(200);
    const stale = (await preview(b).expect(201)).body;
    await t.http.patch(`/api/cart/items/${variantId}`).set(as(b)).send({ quantity: 1 }).expect(200);
    await create(a, (await preview(a).expect(201)).body.fingerprint).expect(201);
    const placed = await create(b, stale.fingerprint, undefined, lines(stale)).expect(409);
    expect(placed.body.code).toBe('QUOTE_CHANGED');
  });

  it('UC-07.1/AC17 đơn COD chờ của khách giữ món khác: thua món cuối vẫn báo OUT_OF_STOCK, không đổ cho đơn COD', async () => {
    const extra = await second();
    await t.http
      .patch(`/api/cart/items/${variantId}`)
      .set(as(a))
      .send({ isSelected: false })
      .expect(200);
    await t.http
      .post('/api/cart/items')
      .set(as(a))
      .send({ variantId: extra.id, quantity: 1 })
      .expect(201);
    await create(a, (await preview(a).expect(201)).body.fingerprint, 'COD').expect(201);
    await t.http
      .patch(`/api/cart/items/${extra.id}`)
      .set(as(a))
      .send({ isSelected: false })
      .expect(200);
    await t.http
      .patch(`/api/cart/items/${variantId}`)
      .set(as(a))
      .send({ isSelected: true })
      .expect(200);
    const stale = (await preview(a).expect(201)).body;
    await create(b, (await preview(b).expect(201)).body.fingerprint).expect(201);
    const view = await preview(a).expect(409);
    expect(view.body.code).toBe('OUT_OF_STOCK');
    expect(view.body.message).toContain(productName);
    const placed = await create(a, stale.fingerprint, undefined, lines(stale)).expect(409);
    expect(placed.body.code).toBe('OUT_OF_STOCK');
    // A mo gio, gio luu viec bo chon: preview van khong do cho don COD giu mon khac.
    await t.http.get('/api/cart').set(as(a)).expect(200);
    const reopened = await preview(a).expect(422);
    expect(reopened.body.code).toBe('SELECTION_REQUIRED');
  });
});
