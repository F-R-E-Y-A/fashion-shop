import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { DiscountType, VoucherStatus } from '../src/modules/promotions/promotions.types.js';
import { ShippingService } from '../src/modules/shipping/index.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('UC-07.2 checkout ap voucher: server tinh lai, luu vao don, tra luot khi huy (PostgreSQL)', () => {
  let t: TestApp;
  let token: string;
  let addressId: string;
  let voucherId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = (body: Record<string, unknown> = {}) =>
    t.http
      .post('/api/checkout/preview')
      .set(auth())
      .send({ addressId, ...body });
  const createCod = (fingerprint: string, body: Record<string, unknown> = {}) =>
    t.http
      .post('/api/checkout/orders')
      .set(auth())
      .send({ addressId, fingerprint, idempotencyKey: randomUUID(), gateway: 'COD', ...body });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const user = await t.prisma.user.create({
      data: { email: 'voucher@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: 0 });
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'T01', name: 'Tỉnh thử', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'T0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId: user.id,
          administrativeAreaId: commune.id,
          recipientName: 'Khách voucher',
          phone: '0901234567',
          detailAddress: 'Địa chỉ kiểm thử',
          isDefault: true,
        },
      })
    ).id;
    await seedShipping(t.prisma);
    const variantId = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } }))
      .id;
    // 2 x 260.000 = 520.000: khong voucher thi mien ship, tru 30.000 thi duoi nguong 500.000.
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '260000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 10 } });
    await t.http.post('/api/cart/items').set(auth()).send({ variantId, quantity: 2 }).expect(201);
    voucherId = (
      await t.prisma.voucher.create({
        data: {
          code: 'GIAM30K',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(30000),
          usageLimit: 1,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-07.2/AC1 preview tinh giam tren server; mien ship xet tien hang SAU giam', async () => {
    const plain = (await preview().expect(201)).body;
    expect(plain).toMatchObject({ discountAmount: '0.00', shippingFeeAmount: '0.00' });
    const quote = (await preview({ voucherCode: 'giam30k' }).expect(201)).body;
    expect(quote).toMatchObject({
      subtotalAmount: '520000.00',
      discountAmount: '30000.00',
      shippingFeeAmount: '30000.00',
      totalAmount: '520000.00',
      appliedDiscount: { kind: 'VOUCHER', id: voucherId, code: 'GIAM30K' },
    });
    expect(quote.fingerprint).not.toBe(plain.fingerprint);
  });

  it('UC-07.2/AC2 dat don luu discountAmount va ghi mot luot; huy don tra luot', async () => {
    const quote = (await preview({ voucherCode: 'GIAM30K' }).expect(201)).body;
    const order = (await createCod(quote.fingerprint, { voucherCode: 'GIAM30K' }).expect(201)).body;
    expect(order).toMatchObject({ discountAmount: '30000.00', totalAmount: '520000.00' });
    expect(await t.prisma.voucherUsage.count({ where: { voucherId, orderId: order.id } })).toBe(1);
    await t.http.post(`/api/orders/${order.id}/cancel`).set(auth()).expect(201);
    expect(await t.prisma.voucherUsage.count({ where: { voucherId } })).toBe(0);
  });

  it('UC-07.2/AC2 don COD co voucher bi hoan ve kho (RETURNED) thi huy don va tra luot', async () => {
    const quote = (await preview({ voucherCode: 'GIAM30K' }).expect(201)).body;
    const order = (await createCod(quote.fingerprint, { voucherCode: 'GIAM30K' }).expect(201)).body;
    await t.prisma.order.update({ where: { id: order.id }, data: { status: 'SHIPPED' } });
    await t.prisma.shipment.create({ data: { orderId: order.id, status: 'FAILED' } });
    await t.app.get(ShippingService).updateShipmentStatus(order.id, 'RETURNED');
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CANCELLED',
    );
    expect(await t.prisma.voucherUsage.count({ where: { voucherId } })).toBe(0);
  });

  it('UC-07.2/E1 ma sai tra 422 DISCOUNT_INVALID, khong bi che thanh loi khac', async () => {
    const res = await preview({ voucherCode: 'KHONGCO' }).expect(422);
    expect(res.body.code).toBe('DISCOUNT_INVALID');
  });

  // Ma mat hieu luc (admin tat, het han, het luot) truoc luc dat: quote trong create bao 422.
  // DB cam usageLimit = 0 (vouchers_usage_limit_positive_ck) nen gia lap bang cach tat ma.
  // Hai don tranh luot cuoi cung luc thi don sau truot o recordVoucherUsage (FOR UPDATE), nhan 409.
  it('UC-07.2/E2 ma bi tat giua preview va dat: bao DISCOUNT_INVALID, khong tao don, khong giu hang', async () => {
    const quote = (await preview({ voucherCode: 'GIAM30K' }).expect(201)).body;
    await t.prisma.voucher.update({ where: { id: voucherId }, data: { status: 'INACTIVE' } });
    const res = await createCod(quote.fingerprint, { voucherCode: 'GIAM30K' }).expect(422);
    expect(res.body.code).toBe('DISCOUNT_INVALID');
    expect(await t.prisma.order.count()).toBe(0);
    expect(await t.prisma.inventoryReservation.count()).toBe(0);
  });
});
