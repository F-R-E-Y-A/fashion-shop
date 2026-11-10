import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

// Issue #66: preview tra 422 cho hai loi khac nhau; web phai phan biet duoc bang `code`, khong bang ma HTTP.
describe('UC-07.1 preview: hai loi 422 phan biet bang code (PostgreSQL)', () => {
  let t: TestApp;
  let token: string;
  let addressId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = () => t.http.post('/api/checkout/preview').set(auth()).send({ addressId });

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const user = await t.prisma.user.create({
      data: { email: 'preview@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    token = await t.app.get(JwtService).signAsync({ sub: user.id, ver: 0 });
    const province = await t.prisma.administrativeArea.create({
      data: { code: 'P01', name: 'Tỉnh thử', level: 'PROVINCE' },
    });
    // Khong nap bieu phi: xa nay khong co dong shipping_rates nao.
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'P0101', name: 'Phường thử', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId: user.id,
          administrativeAreaId: commune.id,
          recipientName: 'Khách thử',
          phone: '0901234567',
          detailAddress: 'Địa chỉ kiểm thử',
          isDefault: true,
        },
      })
    ).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-07.1/AC15 gio chua chon mon: 422 code SELECTION_REQUIRED', async () => {
    const res = await preview().expect(422);
    expect(res.body).toMatchObject({
      statusCode: 422,
      code: 'SELECTION_REQUIRED',
      message: 'Chọn sản phẩm đủ tồn kho trong giỏ trước khi thanh toán.',
    });
  });

  it('UC-07.1/AC13 dia chi chua co bieu phi: 422 kem ly do, khong mang code SELECTION_REQUIRED', async () => {
    const variant = await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } });
    await t.prisma.inventory.create({ data: { productVariantId: variant.id, quantityOnHand: 5 } });
    await t.http
      .post('/api/cart/items')
      .set(auth())
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);

    const res = await preview().expect(422);
    expect(res.body.message).toBe('Địa chỉ này chưa có biểu phí giao hàng.');
    expect(res.body.code).not.toBe('SELECTION_REQUIRED');
  });
});
