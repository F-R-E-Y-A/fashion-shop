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

  it('R2-P1.1 + R2-P1.3 + R2-P2.5: chan route deliver/delivery-failed va ghi de MOCK tren van don GHN that, chan webhook cu ghi de FAILED', async () => {
    const { orderId } = await createProcessingCodOrder();
    await t.prisma.shipment.create({
      data: {
        orderId,
        carrierName: 'GHN',
        trackingNumber: 'L4REAL003',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: 'Chờ lấy hàng',
      },
    });

    // R2-P1.1: GET chi tiết đơn trả actions.markDelivered=false & deliveryFailed=false
    const detailRes = await t.http.get(`/api/admin/orders/${orderId}`).set(adminAuth()).expect(200);
    expect(detailRes.body.actions.markDelivered).toBe(false);
    expect(detailRes.body.actions.deliveryFailed).toBe(false);

    // R2-P1.1: Hai route quản trị thủ công cũ đều phải bị chặn 409 khi đã có vận đơn GHN thật
    await t.http
      .post(`/api/admin/orders/${orderId}/delivered`)
      .set(adminAuth())
      .send({})
      .expect(409);
    await t.http
      .post(`/api/admin/orders/${orderId}/delivery-failed`)
      .set(adminAuth())
      .send({ reason: 'Thử chốt tay khi có GHN thật' })
      .expect(409);

    const stockUnchanged = (
      await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } })
    ).quantityOnHand;
    expect(stockUnchanged).toBe(8);
    const orderUnchanged = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(orderUnchanged.status).toBe('PROCESSING');
    expect(orderUnchanged.payments[0]?.status).toBe('PENDING');

    // R2-P1.3: Request tạo MOCK từ tab cũ không được ghi đè vận đơn GHN thật đang ở PENDING
    await t.http
      .post(`/api/admin/orders/${orderId}/shipment`)
      .set(adminAuth())
      .send({ mode: 'MOCK' })
      .expect(409);
    const shipmentPreserved = await t.prisma.shipment.findUniqueOrThrow({ where: { orderId } });
    expect(shipmentPreserved.trackingNumber).toBe('L4REAL003');
    expect(shipmentPreserved.isMock).toBe(false);

    // R2-P2.5: Webhook waiting_to_return có mốc Time mới hơn -> FAILED; webhook delivering cũ hơn bị bỏ qua
    await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({
        OrderCode: 'L4REAL003',
        Status: 'waiting_to_return',
        Time: '2026-11-20T01:05:00Z',
      })
      .expect(200);

    const staleWebhook = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({
        OrderCode: 'L4REAL003',
        Status: 'delivering',
        Time: '2026-11-20T01:00:00Z',
      })
      .expect(200);
    expect(staleWebhook.body).toMatchObject({ processed: false, ignored: true });
    expect((await t.prisma.shipment.findUniqueOrThrow({ where: { orderId } })).status).toBe(
      'FAILED',
    );

    // Sự kiện giao lại có Time mới hơn (01:10 > 01:05) được chấp nhận
    const newerRedelivery = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({
        OrderCode: 'L4REAL003',
        Status: 'delivering',
        Time: '2026-11-20T01:10:00Z',
      })
      .expect(200);
    expect(newerRedelivery.body).toMatchObject({ processed: true, status: 'IN_TRANSIT' });
    const afterRedelivery = await t.prisma.shipment.findUniqueOrThrow({ where: { orderId } });
    expect(afterRedelivery.status).toBe('IN_TRANSIT');
    expect(afterRedelivery.carrierUpdatedAt?.toISOString()).toBe('2026-11-20T01:10:00.000Z');
  });

  it('R3-P1.1: tao van don GHN ghi intent va chot PROCESSING duoi khoa truoc khi goi GHN, chan dong thoi khach huy / admin cancel-refund / tao MOCK / tao trung', async () => {
    const { GhnCarrierGateway } = await import('../src/modules/shipping/ghn.carrier.js');
    const { PaymentsService } = await import('../src/modules/payments/index.js');
    const ghnGateway = t.app.get(GhnCarrierGateway);
    const vnpay = t.app.get(PaymentsService).gateways.get('VNPAY');
    const origVnpConfigured = vnpay.configured.bind(vnpay);
    const origVnpRefund = vnpay.refund?.bind(vnpay);
    vnpay.configured = () => true;
    vnpay.refund = async () => ({
      requestId: randomUUID(),
      receipt: `REFUND:VNPAY:${randomUUID()}`,
      payload: {},
    });

    // Tạo đơn trả trước CONFIRMED (khách thường có quyền tự hủy + hoàn tiền ở trạng thái CONFIRMED)
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
    // Đưa đơn sang CONFIRMED kèm thanh toán trả trước SUCCEEDED để mô phỏng đơn trả trước có thể tự hủy
    await t.prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
    await t.prisma.payment.updateMany({
      where: { orderId },
      data: { gateway: 'VNPAY', status: 'SUCCEEDED' },
    });

    let ghnEntered!: () => void;
    const ghnStarted = new Promise<void>((resolve) => {
      ghnEntered = resolve;
    });
    let releaseGhn!: (value: {
      carrierName: string;
      trackingNumber: string;
      isMock: boolean;
      status: 'PENDING';
      carrierStatus: string;
      statusNote: string;
      expectedDeliveryAt: null;
    }) => void;
    const ghnDeferred = new Promise<{
      carrierName: string;
      trackingNumber: string;
      isMock: boolean;
      status: 'PENDING';
      carrierStatus: string;
      statusNote: string;
      expectedDeliveryAt: null;
    }>((resolve) => {
      releaseGhn = resolve;
    });

    const origConfigured = ghnGateway.configured.bind(ghnGateway);
    const origCreateOrder = ghnGateway.createOrder.bind(ghnGateway);
    ghnGateway.configured = () => true;
    ghnGateway.createOrder = async () => {
      ghnEntered();
      return ghnDeferred;
    };

    try {
      const createPromise = t.http
        .post(`/api/admin/orders/${orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'AUTO' })
        .then((res) => res);

      // Chờ đúng thời điểm Pha 1 đã commit và đang gọi GHN ngoài lock
      await ghnStarted;

      // Lúc này đơn vẫn giữ ở CONFIRMED nhưng đã có bản ghi giữ chỗ `creating#<attemptId>` (isMock=false, trackingNumber=null)
      const midOrder = await t.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { shipment: true },
      });
      expect(midOrder.status).toBe('CONFIRMED');
      expect(midOrder.shipment?.isMock).toBe(false);
      expect(midOrder.shipment?.trackingNumber).toBeNull();
      expect(midOrder.shipment?.carrierStatus).toMatch(/^creating#[0-9a-f]{8}$/);

      // 1. Khách xem chi tiết đơn thấy canCancel=false, gọi tự hủy đơn -> bị chặn 409 (không trả kho, không hoàn tiền)
      const customerMidView = await t.http
        .get(`/api/orders/${orderId}`)
        .set(customerAuth())
        .expect(200);
      expect(customerMidView.body.canCancel).toBe(false);
      expect(customerMidView.body.cancelRefunds).toBe(false);
      await t.http.post(`/api/orders/${orderId}/cancel`).set(customerAuth()).send({}).expect(409);

      // 2. Admin gọi cancel-refund hoặc start-processing -> đều bị chặn 409
      await t.http
        .post(`/api/admin/orders/${orderId}/cancel-refund`)
        .set(adminAuth())
        .send({ reason: 'Thử hủy khi đang tạo GHN' })
        .expect(409);
      await t.http
        .post(`/api/admin/orders/${orderId}/start-processing`)
        .set(adminAuth())
        .send({})
        .expect(409);

      // 3. Admin tab khác bấm tạo MOCK hoặc tạo AUTO trùng -> đều bị chặn 409
      await t.http
        .post(`/api/admin/orders/${orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'MOCK' })
        .expect(409);
      await t.http
        .post(`/api/admin/orders/${orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'AUTO' })
        .expect(409);

      // 4. Webhook đúng ClientOrderCode đến trong lúc đang tạo -> trả 503 để GHN tự động retry sau 5 giây (không mất sự kiện)
      await t.http
        .post('/api/shipping/webhook/ghn')
        .set('x-carrier-token', 'test-ghn-webhook-secret')
        .send({ OrderCode: 'L4CONCURRENT', ClientOrderCode: orderCode, Status: 'picked' })
        .expect(503);

      // Giải phóng GHN trả về mã vận đơn thật -> Pha 2 lưu sạch vào PostgreSQL và chuyển đơn sang PROCESSING
      releaseGhn({
        carrierName: 'GHN',
        trackingNumber: 'L4CONCURRENT',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã tạo vận đơn GHN thành công',
        expectedDeliveryAt: null,
      });

      const finalCreateRes = await createPromise;
      expect(finalCreateRes.status).toBe(201);
      expect(finalCreateRes.body).toMatchObject({
        trackingNumber: 'L4CONCURRENT',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
      });

      const finalOrder = await t.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { shipment: true },
      });
      expect(finalOrder.status).toBe('PROCESSING');
      expect(finalOrder.shipment?.trackingNumber).toBe('L4CONCURRENT');
      expect(finalOrder.shipment?.carrierStatus).toBe('ready_to_pick');

      // 5. Khi GHN retry lại đúng webhook 'picked' vừa nhận 503 trước đó -> cập nhật thành công lên IN_TRANSIT / SHIPPED
      const retriedWebhook = await t.http
        .post('/api/shipping/webhook/ghn')
        .set('x-carrier-token', 'test-ghn-webhook-secret')
        .send({ OrderCode: 'L4CONCURRENT', ClientOrderCode: orderCode, Status: 'picked' })
        .expect(200);
      expect(retriedWebhook.body).toMatchObject({
        processed: true,
        status: 'IN_TRANSIT',
        carrierStatus: 'picked',
      });
      expect((await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
        'SHIPPED',
      );
    } finally {
      ghnGateway.configured = origConfigured;
      ghnGateway.createOrder = origCreateOrder;
      vnpay.configured = origVnpConfigured;
      vnpay.refund = origVnpRefund;
    }
  });

  it('R3-P2.3: don COD bi GHN huy truoc luc lay hang (cancel) khong bi ket: admin duoc phep huy COD hoan kho hoac tao van don thay the', async () => {
    // Nhánh A: Admin hủy đơn COD & hoàn kho sau khi GHN báo cancel trước lúc lấy hàng
    const { orderId } = await createProcessingCodOrder();
    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(8);

    await t.prisma.shipment.create({
      data: {
        orderId,
        carrierName: 'GHN',
        trackingNumber: 'L4CANCEL01',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
      },
    });

    await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4CANCEL01', Status: 'cancel' })
      .expect(200);

    // GET chi tiết đơn: vẫn chặn markDelivered, nhưng MỞ deliveryFailed
    const detail = await t.http.get(`/api/admin/orders/${orderId}`).set(adminAuth()).expect(200);
    expect(detail.body.actions.markDelivered).toBe(false);
    expect(detail.body.actions.deliveryFailed).toBe(true);

    // Chốt giao thành công thủ công vẫn bị chặn 409
    await t.http
      .post(`/api/admin/orders/${orderId}/delivered`)
      .set(adminAuth())
      .send({})
      .expect(409);

    // Chốt giao thất bại / hủy COD hoàn kho thành công (hàng vẫn tại kho)
    await t.http
      .post(`/api/admin/orders/${orderId}/delivery-failed`)
      .set(adminAuth())
      .send({ reason: 'GHN hủy vận đơn trước khi lấy hàng, đã kiểm tra hàng còn tại kho' })
      .expect(201);

    expect(
      (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
        .quantityOnHand,
    ).toBe(10);
    const cancelledOrder = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payments: true },
    });
    expect(cancelledOrder.status).toBe('CANCELLED');
    expect(cancelledOrder.payments[0]?.status).toBe('FAILED');

    // Nhánh B: Đơn thứ 2 bị GHN hủy trước lúc lấy hàng -> Admin tạo vận đơn thay thế thành công
    await t.http
      .post('/api/cart/items')
      .set(customerAuth())
      .send({ variantId, quantity: 1 })
      .expect(201);
    const second = await createProcessingCodOrder();
    await t.prisma.shipment.create({
      data: {
        orderId: second.orderId,
        carrierName: 'GHN',
        trackingNumber: 'L4CANCEL02',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
      },
    });
    await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4CANCEL02', Status: 'cancel' })
      .expect(200);

    const replaced = await t.http
      .post(`/api/admin/orders/${second.orderId}/shipment`)
      .set(adminAuth())
      .send({ mode: 'MOCK' })
      .expect(201);
    expect(replaced.body).toMatchObject({
      status: 'PENDING',
      isMock: true,
    });
    expect(replaced.body.trackingNumber).not.toBe('L4CANCEL02');

    // Webhook muộn của mã GHN đã hủy trước đó phải bị bỏ qua
    const staleOldCancel = await t.http
      .post('/api/shipping/webhook/ghn')
      .set('x-carrier-token', 'test-ghn-webhook-secret')
      .send({ OrderCode: 'L4CANCEL02', ClientOrderCode: second.orderCode, Status: 'cancel' })
      .expect(200);
    expect(staleOldCancel.body).toMatchObject({ processed: false, ignored: true });
  });

  it('R4-P1.1 + R4-P2.2 + R4-P2.3: mode GHN that bai giu nguyen quyen khach tu huy CONFIRMED; luot cu (A) sau 45s khong xoa duoc ban ghi giu cho cua luot moi (B); webhook doi soat create_uncertain chuyen CONFIRMED sang PROCESSING', async () => {
    const { GhnCarrierGateway, GhnApiRejectedError } =
      await import('../src/modules/shipping/ghn.carrier.js');
    const { PaymentsService } = await import('../src/modules/payments/index.js');
    const ghnGateway = t.app.get(GhnCarrierGateway);
    const vnpay = t.app.get(PaymentsService).gateways.get('VNPAY');
    const origConfigured = ghnGateway.configured.bind(ghnGateway);
    const origCreateOrder = ghnGateway.createOrder.bind(ghnGateway);
    const origQueryByClientCode = ghnGateway.queryOrderByClientCode.bind(ghnGateway);
    const origVnpConfigured = vnpay.configured.bind(vnpay);
    const origVnpRefund = vnpay.refund?.bind(vnpay);
    vnpay.configured = () => true;
    vnpay.refund = async () => ({
      requestId: randomUUID(),
      receipt: `REFUND:VNPAY:${randomUUID()}`,
      payload: {},
    });

    // Helper tạo đơn trả trước CONFIRMED (đã chốt tồn kho SALE và payment VNPAY SUCCEEDED)
    async function createConfirmedPrepaidOrder() {
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
      // Chốt kho thông qua confirm-cod rồi đặt về CONFIRMED + VNPAY SUCCEEDED để khớp đơn online đã trả tiền
      await t.http
        .post(`/api/admin/orders/${orderId}/confirm-cod`)
        .set(adminAuth())
        .send({})
        .expect(201);
      await t.prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
      await t.prisma.payment.updateMany({
        where: { orderId },
        data: { gateway: 'VNPAY', status: 'SUCCEEDED' },
      });
      return { orderId, orderCode };
    }

    try {
      // === Phần 1 (R4-P2.2): mode='GHN' bị từ chối và GHN xác nhận chưa tạo đơn -> xóa intent, giữ đơn ở CONFIRMED, khách vẫn tự hủy & trả kho được ===
      const order1 = await createConfirmedPrepaidOrder();
      expect(
        (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
          .quantityOnHand,
      ).toBe(8);

      ghnGateway.configured = () => true;
      ghnGateway.createOrder = async () => {
        throw new GhnApiRejectedError('Địa chỉ không hợp lệ bên GHN', 400, 400);
      };
      ghnGateway.queryOrderByClientCode = async () => null;

      await t.http
        .post(`/api/admin/orders/${order1.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'GHN' })
        .expect(503);

      const afterFail = await t.prisma.order.findUniqueOrThrow({
        where: { id: order1.orderId },
        include: { shipment: true },
      });
      expect(afterFail.status).toBe('CONFIRMED');
      expect(afterFail.shipment).toBeNull();

      // Khách kiểm tra đơn: canCancel vẫn là true!
      const customerViewAfterFail = await t.http
        .get(`/api/orders/${order1.orderId}`)
        .set(customerAuth())
        .expect(200);
      expect(customerViewAfterFail.body.canCancel).toBe(true);

      // Khách bấm tự hủy đơn thành công -> đơn tự hủy + hoàn tiền tự động (REFUNDED) và hàng hoàn về kho (8 -> 10)
      const cancelRes = await t.http
        .post(`/api/orders/${order1.orderId}/cancel`)
        .set(customerAuth())
        .send({})
        .expect(201);
      expect(['CANCELLED', 'REFUNDED']).toContain(cancelRes.body.status);
      expect(
        (await t.prisma.inventory.findUniqueOrThrow({ where: { productVariantId: variantId } }))
          .quantityOnHand,
      ).toBe(10);

      // === Phần 2 (R4-P1.1): Lượt A treo quá 45s, lượt B tiếp quản; khi A thất bại KHÔNG được xóa bản ghi giữ chỗ của B ===
      await t.http
        .post('/api/cart/items')
        .set(customerAuth())
        .send({ variantId, quantity: 1 })
        .expect(201);
      const order2 = await createConfirmedPrepaidOrder();

      let enteredA!: () => void;
      const startedA = new Promise<void>((r) => {
        enteredA = r;
      });
      let rejectA!: (err: unknown) => void;
      const deferredA = new Promise<never>((_r, rej) => {
        rejectA = rej;
      });

      let enteredB!: () => void;
      const startedB = new Promise<void>((r) => {
        enteredB = r;
      });
      let resolveB!: (val: {
        carrierName: string;
        trackingNumber: string;
        isMock: boolean;
        status: 'PENDING';
        carrierStatus: string;
        statusNote: string;
        expectedDeliveryAt: null;
      }) => void;
      const deferredB = new Promise<{
        carrierName: string;
        trackingNumber: string;
        isMock: boolean;
        status: 'PENDING';
        carrierStatus: string;
        statusNote: string;
        expectedDeliveryAt: null;
      }>((r) => {
        resolveB = r;
      });

      let ghnCallCount = 0;
      ghnGateway.createOrder = async () => {
        ghnCallCount += 1;
        if (ghnCallCount === 1) {
          enteredA();
          return deferredA;
        }
        enteredB();
        return deferredB;
      };
      ghnGateway.queryOrderByClientCode = async () => null;

      // Lượt A bắt đầu (mode: GHN)
      const reqA = t.http
        .post(`/api/admin/orders/${order2.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'GHN' })
        .then((res) => res);
      await startedA;

      const shipA = await t.prisma.shipment.findUniqueOrThrow({
        where: { orderId: order2.orderId },
      });
      expect(shipA.carrierStatus).toMatch(/^creating#[0-9a-f]{8}$/);

      // Tua lùi updatedAt 46 giây để mô phỏng lượt A đã quá hạn 45 giây
      await t.prisma.$executeRaw`
        UPDATE public.shipments
        SET updated_at = NOW() - INTERVAL '46 seconds'
        WHERE order_id = ${order2.orderId}::uuid
      `;

      // Lượt B tiếp quản hợp lệ
      const reqB = t.http
        .post(`/api/admin/orders/${order2.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'AUTO' })
        .then((res) => res);
      await startedB;

      const shipB = await t.prisma.shipment.findUniqueOrThrow({
        where: { orderId: order2.orderId },
      });
      expect(shipB.carrierStatus).toMatch(/^creating#[0-9a-f]{8}$/);
      expect(shipB.carrierStatus).not.toBe(shipA.carrierStatus);

      // Lượt A thất bại muộn -> không được xóa bản ghi giữ chỗ của lượt B!
      rejectA(new GhnApiRejectedError('A timeout/fail late', 400, 400));
      const resA = await reqA;
      expect(resA.status).toBe(503);

      const shipStillB = await t.prisma.shipment.findUnique({
        where: { orderId: order2.orderId },
      });
      expect(shipStillB?.carrierStatus).toBe(shipB.carrierStatus);

      // Trong khi B vẫn đang chờ GHN, khách bấm hủy hoặc admin tạo MOCK đều tiếp tục bị chặn 409!
      await t.http
        .post(`/api/orders/${order2.orderId}/cancel`)
        .set(customerAuth())
        .send({})
        .expect(409);
      await t.http
        .post(`/api/admin/orders/${order2.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'MOCK' })
        .expect(409);

      // Lượt B hoàn tất -> ghi vận đơn thật và chuyển đơn sang PROCESSING
      resolveB({
        carrierName: 'GHN',
        trackingNumber: 'L4TAKEOVER_B',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
        statusNote: 'Lượt B thành công',
        expectedDeliveryAt: null,
      });
      const resB = await reqB;
      expect(resB.status).toBe(201);
      expect(resB.body.trackingNumber).toBe('L4TAKEOVER_B');
      expect(
        (await t.prisma.order.findUniqueOrThrow({ where: { id: order2.orderId } })).status,
      ).toBe('PROCESSING');

      // === Phần 3 (R4-P2.3): Đơn CONFIRMED đang ở create_uncertain nhận webhook ready_to_pick -> điền trackingNumber và chuyển đơn sang PROCESSING ===
      await t.http
        .post('/api/cart/items')
        .set(customerAuth())
        .send({ variantId, quantity: 1 })
        .expect(201);
      const order3 = await createConfirmedPrepaidOrder();
      await t.prisma.shipment.create({
        data: {
          orderId: order3.orderId,
          carrierName: 'GHN',
          trackingNumber: null,
          status: 'PENDING',
          isMock: false,
          carrierStatus: 'create_uncertain',
          statusNote: 'Chờ đối soát',
        },
      });

      const whReconciled = await t.http
        .post('/api/shipping/webhook/ghn')
        .set('x-carrier-token', 'test-ghn-webhook-secret')
        .send({
          OrderCode: 'L4WHRECONCILE',
          ClientOrderCode: order3.orderCode,
          Status: 'ready_to_pick',
        })
        .expect(200);
      expect(whReconciled.body).toMatchObject({
        processed: true,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
      });
      const order3AfterWh = await t.prisma.order.findUniqueOrThrow({
        where: { id: order3.orderId },
        include: { shipment: true },
      });
      expect(order3AfterWh.status).toBe('PROCESSING');
      expect(order3AfterWh.shipment?.trackingNumber).toBe('L4WHRECONCILE');

      // === Phần 4 (R5-P1 & R5-P2): Chặn hai chiều giữa POST /admin/payments/:id/refund và tạo vận đơn GHN; không ghi lùi carrierStatus khi lượt cũ về muộn trùng mã ===
      await t.http
        .post('/api/cart/items')
        .set(customerAuth())
        .send({ variantId, quantity: 1 })
        .expect(201);
      const order4 = await createConfirmedPrepaidOrder();
      const payment4 = await t.prisma.payment.findFirstOrThrow({
        where: { orderId: order4.orderId, status: 'SUCCEEDED' },
      });

      let vnpayRefundCalls = 0;
      vnpay.refund = async () => {
        vnpayRefundCalls += 1;
        return {
          requestId: 'VNP_R5_REFUND',
          receipt: 'VNP_R5_RECEIPT',
          payload: { vnp_ResponseCode: '00' },
        };
      };

      let resolveGhn4A!: (res: Awaited<ReturnType<typeof origCreateOrder>>) => void;
      const startedGhn4A = new Promise<void>((resolve) => {
        ghnGateway.createOrder = () => {
          resolve();
          return new Promise<Awaited<ReturnType<typeof origCreateOrder>>>((res) => {
            resolveGhn4A = res;
          });
        };
      });

      // 4a. Trong lúc GHN đang tạo vận đơn (creating#...), POST /admin/payments/:id/refund phải bị chặn 409 và không gọi cổng thanh toán
      const reqShip4A = t.http
        .post(`/api/admin/orders/${order4.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'GHN' })
        .then((res) => res);
      await startedGhn4A;

      await t.http
        .post(`/api/admin/payments/${payment4.id}/refund`)
        .set(adminAuth())
        .send({ reason: 'Hoàn tiền trực tiếp khi đang tạo GHN' })
        .expect(409);
      expect(vnpayRefundCalls).toBe(0);

      // 4b. Tua lùi 46 giây để lượt 4B tiếp quản và đối soát thấy vận đơn đã ở trạng thái picking (mốc 10:05)
      await t.prisma.$executeRaw`
        UPDATE public.shipments
        SET updated_at = NOW() - INTERVAL '46 seconds'
        WHERE order_id = ${order4.orderId}::uuid
      `;
      ghnGateway.queryOrderByClientCode = async () => ({
        carrierName: 'GHN',
        trackingNumber: 'L4R5_SAME_TRACK',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'picking',
        statusNote: 'Tài xế GHN đang đến lấy hàng',
        expectedDeliveryAt: null,
        occurredAt: '2026-11-20T10:05:00.000Z',
      });

      const resShip4B = await t.http
        .post(`/api/admin/orders/${order4.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'AUTO' })
        .expect(201);
      expect(resShip4B.body).toMatchObject({
        trackingNumber: 'L4R5_SAME_TRACK',
        status: 'PENDING',
        carrierStatus: 'picking',
      });

      // Lượt 4A trả về muộn cùng mã L4R5_SAME_TRACK nhưng carrierStatus = ready_to_pick (không có occurredAt)
      resolveGhn4A({
        carrierName: 'GHN',
        trackingNumber: 'L4R5_SAME_TRACK',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã tạo vận đơn trên GHN',
        expectedDeliveryAt: null,
      });
      const resShip4A = await reqShip4A;
      expect(resShip4A.status).toBe(201);
      // Không được ghi lùi carrierStatus từ picking về ready_to_pick!
      expect(resShip4A.body.carrierStatus).toBe('picking');
      const ship4InDb = await t.prisma.shipment.findUniqueOrThrow({
        where: { orderId: order4.orderId },
      });
      expect(ship4InDb.carrierStatus).toBe('picking');
      expect(ship4InDb.carrierUpdatedAt?.toISOString()).toBe('2026-11-20T10:05:00.000Z');

      // 4c. Chiều ngược lại: Đơn đang có lệnh hoàn tiền chờ kết quả (REFUND-INTENT RECEIVED) thì từ chối tạo vận đơn (cả GHN và MOCK)
      await t.http
        .post('/api/cart/items')
        .set(customerAuth())
        .send({ variantId, quantity: 1 })
        .expect(201);
      const order5 = await createConfirmedPrepaidOrder();
      const payment5 = await t.prisma.payment.findFirstOrThrow({
        where: { orderId: order5.orderId, status: 'SUCCEEDED' },
      });

      let ghnCallsForOrder5 = 0;
      ghnGateway.createOrder = async () => {
        ghnCallsForOrder5 += 1;
        return {
          carrierName: 'GHN',
          trackingNumber: 'L4R5_SHOULD_NOT_CREATE',
          isMock: false,
          status: 'PENDING',
          carrierStatus: 'ready_to_pick',
          statusNote: 'Không được gọi',
          expectedDeliveryAt: null,
        };
      };

      // Giả lập cổng VNPAY timeout khi admin gọi hoàn tiền -> để lại REFUND-INTENT ở trạng thái RECEIVED (503)
      vnpay.refund = async () => {
        throw new Error('VNPAY refund timeout');
      };
      await t.http
        .post(`/api/admin/payments/${payment5.id}/refund`)
        .set(adminAuth())
        .send({ reason: 'Hoàn tiền bị treo chờ đối soát' })
        .expect(503);

      // Khi REFUND-INTENT đang RECEIVED, mọi yêu cầu tạo vận đơn (GHN, AUTO, MOCK) đều bị chặn 409 dưới khóa đơn
      await t.http
        .post(`/api/admin/orders/${order5.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'GHN' })
        .expect(409);
      await t.http
        .post(`/api/admin/orders/${order5.orderId}/shipment`)
        .set(adminAuth())
        .send({ mode: 'MOCK' })
        .expect(409);
      expect(ghnCallsForOrder5).toBe(0);
    } finally {
      ghnGateway.configured = origConfigured;
      ghnGateway.createOrder = origCreateOrder;
      ghnGateway.queryOrderByClientCode = origQueryByClientCode;
      vnpay.configured = origVnpConfigured;
      vnpay.refund = origVnpRefund;
    }
  });
});
