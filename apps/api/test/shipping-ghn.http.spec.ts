import { randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedShipping } from '../prisma/seed/shipping.seed.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('PH-02 Shipping GHN Sandbox, du phong mo phong va webhook (PostgreSQL)', () => {
  const originalWebhookSecret = process.env.SHIPPING_WEBHOOK_SECRET;
  let t: TestApp;
  let customerToken: string;
  let adminToken: string;
  let addressId: string;
  let variantId: string;

  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });
  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function createProcessingCodOrder() {
    const quote = await t.http
      .post('/api/checkout/preview')
      .set(customerAuth())
      .send({ addressId })
      .expect(201);
    const created = await t.http
      .post('/api/checkout/orders')
      .set(customerAuth())
      .send({
        addressId,
        fingerprint: quote.body.fingerprint,
        idempotencyKey: randomUUID(),
        gateway: 'COD',
      })
      .expect(201);
    const orderId = created.body.id as string;
    const orderCode = created.body.orderCode as string;
    await t.http
      .post(`/api/admin/orders/${orderId}/confirm-cod`)
      .set(adminAuth())
      .send({})
      .expect(201);
    return { orderId, orderCode };
  }

  beforeAll(async () => {
    process.env.SHIPPING_WEBHOOK_SECRET = 'test-ghn-webhook-secret';
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const customer = await t.prisma.user.create({
      data: { email: 'ship-customer@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    const admin = await t.prisma.user.create({
      data: { email: 'ship-admin@fixture.test', passwordHash: 'not-used', status: 'ACTIVE' },
    });
    expect((await grantAdminRole(t.prisma, 'ship-admin@fixture.test')).outcome).toBe('GRANTED');
    const jwt = t.app.get(JwtService);
    customerToken = await jwt.signAsync({ sub: customer.id, ver: 0 });
    adminToken = await jwt.signAsync({ sub: admin.id, ver: 0 });

    const province = await t.prisma.administrativeArea.create({
      data: { code: 'S01', name: 'Thành phố Hồ Chí Minh', level: 'PROVINCE' },
    });
    const commune = await t.prisma.administrativeArea.create({
      data: { code: 'S0101', name: 'Phường Bến Nghé', level: 'COMMUNE', parentId: province.id },
    });
    addressId = (
      await t.prisma.address.create({
        data: {
          userId: customer.id,
          administrativeAreaId: commune.id,
          recipientName: 'Khách giao hàng',
          phone: '0901234567',
          detailAddress: '72 Lê Thánh Tôn',
          isDefault: true,
        },
      })
    ).id;
    await seedShipping(t.prisma);

    variantId = (await t.prisma.productVariant.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;
    await t.prisma.productVariant.update({
      where: { id: variantId },
      data: { listPrice: '200000', salePrice: null },
    });
    await t.prisma.inventory.create({ data: { productVariantId: variantId, quantityOnHand: 10 } });
    await t.http
      .post('/api/cart/items')
      .set(customerAuth())
      .send({ variantId, quantity: 2 })
      .expect(201);
  });

  afterAll(async () => {
    await t?.close();
    if (originalWebhookSecret !== undefined) {
      process.env.SHIPPING_WEBHOOK_SECRET = originalWebhookSecret;
    } else {
      delete process.env.SHIPPING_WEBHOOK_SECRET;
    }
  });

  it('P1-1 + P2-7 + P1-3: van don GHN that chan mo phong 409, giu picking o PENDING, giao lai tu FAILED sang DELIVERED va chot COD', async () => {
    const { orderId, orderCode } = await createProcessingCodOrder();
    await t.prisma.shipment.create({
      data: {
        orderId,
        carrierName: 'GHN',
        trackingNumber: 'L4REAL001',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: 'Chờ lấy hàng',
      },
    });

    // P1-1: Admin không được dùng endpoint mô phỏng trên vận đơn GHN thật
    await t.http
      .patch(`/api/admin/orders/${orderId}/shipment/status`)
      .set(adminAuth())
      .send({ status: 'DELIVERED', note: 'Thử bấm mô phỏng' })
      .expect(409);

    // P2-7: Webhook GHN 'picking' chỉ cập nhật sub-status trong PENDING, chưa sang SHIPPED
    const pickingRes = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4REAL001', ClientOrderCode: orderCode, Status: 'picking' })
      .expect(200);
    expect(pickingRes.body).toMatchObject({
      processed: true,
      status: 'PENDING',
      carrierStatus: 'picking',
    });
    const orderAfterPicking = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderAfterPicking.status).toBe('PROCESSING');

    // 'picked' mới bàn giao -> IN_TRANSIT & Order.SHIPPED
    await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4REAL001', Status: 'picked' })
      .expect(200);
    expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'SHIPPED',
    );

    // 'waiting_to_return' -> FAILED, chưa hủy đơn hay hoàn kho
    await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4REAL001', Status: 'waiting_to_return' })
      .expect(200);
    expect((await t.prisma.shipment.findUniqueOrThrow({ where: { orderId } })).status).toBe(
      'FAILED',
    );

    // P1-3: Giao lại thành công ('delivered') từ FAILED -> DELIVERED + chốt COD SUCCEEDED
    const redelivered = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4REAL001', Status: 'delivered', Description: 'Giao lại thành công' })
      .expect(200);
    expect(redelivered.body).toMatchObject({ processed: true, status: 'DELIVERED' });

    const finalOrder = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true, shipment: true },
    });
    expect(finalOrder.status).toBe('DELIVERED');
    expect(finalOrder.shipment?.status).toBe('DELIVERED');
    expect(finalOrder.payments[0]?.status).toBe('SUCCEEDED');
  });

  it('P1-4 + P2-6: webhook scrap KHONG cong lai ton kho; webhook ClientOrderCode bo qua ban ghi mock hoac lech ma van don', async () => {
    const { orderId, orderCode } = await createProcessingCodOrder();
    const stockBefore = (
      await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } })
    ).quantityOnHand;
    expect(stockBefore).toBe(8); // 10 - 2 sau khi confirm-cod chốt kho

    await t.prisma.shipment.create({
      data: {
        orderId,
        carrierName: 'GHN',
        trackingNumber: 'L4REAL002',
        status: 'IN_TRANSIT',
        isMock: false,
        carrierStatus: 'delivering',
      },
    });

    // P2-6: OrderCode khác vận đơn hiện tại nhưng trùng ClientOrderCode -> phải bị bỏ qua
    const mismatchRes = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4STALE999', ClientOrderCode: orderCode, Status: 'delivered' })
      .expect(200);
    expect(mismatchRes.body).toMatchObject({ processed: false, ignored: true });

    // P1-4: 'scrap' đi vào FAILED, KHÔNG gọi restock tồn kho và KHÔNG hủy COD tự động
    const scrapRes = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4REAL002', Status: 'scrap' })
      .expect(200);
    expect(scrapRes.body).toMatchObject({
      processed: true,
      status: 'FAILED',
      carrierStatus: 'scrap',
    });

    const stockAfterScrap = (
      await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } })
    ).quantityOnHand;
    expect(stockAfterScrap).toBe(8);
    const orderAfterScrap = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(orderAfterScrap.status).toBe('PROCESSING');
    expect(orderAfterScrap.payments[0]?.status).toBe('PENDING');

    // P2-6 (nhánh mock): tạo đơn mới với vận đơn mô phỏng -> webhook GHN trùng ClientOrderCode phải bỏ qua
    await t.http
      .post('/api/cart/items')
      .set(customerAuth())
      .send({ variantId, quantity: 1 })
      .expect(201);
    const second = await createProcessingCodOrder();
    await t.http
      .post(`/api/admin/orders/${second.orderId}/shipment`)
      .set(adminAuth())
      .send({ mode: 'MOCK' })
      .expect(201);

    const mockIgnored = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4FOREIGN', ClientOrderCode: second.orderCode, Status: 'delivered' })
      .expect(200);
    expect(mockIgnored.body).toMatchObject({ processed: false, ignored: true });
    expect(
      (await t.prisma.shipment.findUniqueOrThrow({ where: { orderId: second.orderId } })).status,
    ).toBe('PENDING');

    // Trong khi đó vận đơn mô phỏng vẫn cho phép admin mô phỏng bình thường
    await t.http
      .patch(`/api/admin/orders/${second.orderId}/shipment/status`)
      .set(adminAuth())
      .send({ status: 'IN_TRANSIT', note: 'Mô phỏng lấy hàng' })
      .expect(200);
  });
});
