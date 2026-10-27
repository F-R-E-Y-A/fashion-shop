import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { PromotionsService } from '../src/modules/promotions/promotions.service.js';
import { DiscountType, VoucherStatus } from '../src/modules/promotions/promotions.types.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const ADMIN_EMAIL = 'admin.promotions@example.test';
const CUSTOMER_EMAIL = 'customer.promotions@example.test';

describe('UC-07.2 & UC-10.1 & UC-10.2 Promotions & Vouchers HTTP & Concurrency', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;
  let service: PromotionsService;

  beforeAll(async () => {
    t = await createTestApp();
    flows = authFlows(t);
    service = t.app.get(PromotionsService);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
  });

  afterAll(async () => {
    await t.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function adminSession() {
    const session = await flows.activateAndLogin(ADMIN_EMAIL);
    expect(await grantAdminRole(t.prisma, ADMIN_EMAIL)).toEqual({
      outcome: 'GRANTED',
      userId: session.id,
    });
    return session;
  }

  async function customerSession() {
    return flows.activateAndLogin(CUSTOMER_EMAIL);
  }

  async function createDummyOrder(
    codeSuffix: string,
    customerEmail = 'khach@example.test',
    userId?: string,
    status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'DELIVERED' = 'PENDING_CONFIRMATION',
    totalAmount = new Decimal(530000),
  ) {
    return t.prisma.order.create({
      data: {
        orderCode: `ORD-${Date.now()}-${codeSuffix}`,
        customerEmail,
        userId: userId ?? null,
        status,
        shippingAddressSnapshot: {},
        subtotalAmount: totalAmount.sub(30000),
        discountAmount: new Decimal(0),
        shippingFeeAmount: new Decimal(30000),
        totalAmount,
      },
    });
  }

  describe('Validation & DTO Regressions (P1 & P2 review comments)', () => {
    it('chặn cấu hình tiền âm khi tạo voucher qua POST /api/admin/vouchers', async () => {
      const admin = await adminSession();

      const res = await t.http.post('/api/admin/vouchers').set(bearer(admin.accessToken)).send({
        code: 'NEG_VOUCHER',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '10',
        maxDiscountAmount: '-50000',
      });

      expect(res.status).toBe(400);
    });

    it('chặn đổi discountType sang PERCENTAGE khi discountValue hiện tại > 100', async () => {
      const admin = await adminSession();

      const created = await t.prisma.voucher.create({
        data: {
          code: 'FIXED50K',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(50000),
        },
      });

      const res = await t.http
        .patch(`/api/admin/vouchers/${created.id}`)
        .set(bearer(admin.accessToken))
        .send({
          discountType: DiscountType.PERCENTAGE,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('100%');
    });

    it('chặn trường lạ và discountType INVALID trong PATCH /api/admin/promotions/:id (UpdatePromotionDto)', async () => {
      const admin = await adminSession();

      const promo = await t.prisma.promotion.create({
        data: {
          name: 'Khuyến mãi hè',
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(10),
          status: 'ACTIVE',
        },
      });

      const resInvalidEnum = await t.http
        .patch(`/api/admin/promotions/${promo.id}`)
        .set(bearer(admin.accessToken))
        .send({
          discountType: 'INVALID',
        });
      expect(resInvalidEnum.status).toBe(400);

      const resUnexpectedField = await t.http
        .patch(`/api/admin/promotions/${promo.id}`)
        .set(bearer(admin.accessToken))
        .send({
          unexpectedField: 'something',
        });
      expect(resUnexpectedField.status).toBe(400);

      const resDiscountOverflow = await t.http
        .patch(`/api/admin/promotions/${promo.id}`)
        .set(bearer(admin.accessToken))
        .send({
          discountValue: '999',
        });
      expect(resDiscountOverflow.status).toBe(400);
    });

    it('chặn subtotal âm khi khách áp dụng voucher POST /api/promotions/vouchers/apply', async () => {
      const res = await t.http.post('/api/promotions/vouchers/apply').send({
        code: 'FREYA10',
        subtotal: '-500000',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Concurrency & Atomic Quota Enforcement in recordVoucherUsage', () => {
    it('bảo vệ quota tổng (usageLimit=1) khi có 2 transaction đồng thời', async () => {
      const voucher = await t.prisma.voucher.create({
        data: {
          code: 'RACE_TOTAL',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(20000),
          usageLimit: 1,
        },
      });

      const order1 = await createDummyOrder('RACE-1');
      const order2 = await createDummyOrder('RACE-2');

      const results = await Promise.allSettled([
        t.prisma.$transaction(async (tx) => {
          return service.recordVoucherUsage(
            {
              voucherId: voucher.id,
              orderId: order1.id,
              discountAmount: '20000',
            },
            tx,
          );
        }),
        t.prisma.$transaction(async (tx) => {
          return service.recordVoucherUsage(
            {
              voucherId: voucher.id,
              orderId: order2.id,
              discountAmount: '20000',
            },
            tx,
          );
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const usages = await t.prisma.voucherUsage.findMany({
        where: { voucherId: voucher.id },
      });
      expect(usages).toHaveLength(1);
    });

    it('bảo vệ quota người dùng (perUserLimit=1) khi cùng một user gọi đồng thời', async () => {
      const customer = await customerSession();

      const voucher = await t.prisma.voucher.create({
        data: {
          code: 'RACE_USER',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(20000),
          usageLimit: 10,
          perUserLimit: 1,
        },
      });

      const order1 = await createDummyOrder('USER-1', CUSTOMER_EMAIL);
      const order2 = await createDummyOrder('USER-2', CUSTOMER_EMAIL);

      const results = await Promise.allSettled([
        t.prisma.$transaction(async (tx) => {
          return service.recordVoucherUsage(
            {
              voucherId: voucher.id,
              orderId: order1.id,
              userId: customer.id,
              discountAmount: '20000',
            },
            tx,
          );
        }),
        t.prisma.$transaction(async (tx) => {
          return service.recordVoucherUsage(
            {
              voucherId: voucher.id,
              orderId: order2.id,
              userId: customer.id,
              discountAmount: '20000',
            },
            tx,
          );
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const usages = await t.prisma.voucherUsage.findMany({
        where: { voucherId: voucher.id, userId: customer.id },
      });
      expect(usages).toHaveLength(1);
    });
  });

  describe('Customer Segmentation Engine (NEW_CUSTOMER & VIP_CUSTOMER)', () => {
    it('áp dụng thành công CHAOBANMOI cho khách hàng mới (0 đơn hàng)', async () => {
      const customer = await customerSession();

      await t.prisma.voucher.create({
        data: {
          code: 'CHAOBANMOI',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(30000),
          minOrderAmount: new Decimal(150000),
        },
      });

      const res = await t.http
        .post('/api/promotions/vouchers/apply')
        .set(bearer(customer.accessToken))
        .send({
          code: 'CHAOBANMOI',
          subtotal: '200000',
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discountAmount).toBe('30000');
    });

    it('từ chối CHAOBANMOI khi khách hàng đã có đơn hàng hoàn tất', async () => {
      const customer = await customerSession();

      await t.prisma.voucher.create({
        data: {
          code: 'CHAOBANMOI',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: new Decimal(30000),
          minOrderAmount: new Decimal(150000),
        },
      });

      await createDummyOrder('OLD-CUST', CUSTOMER_EMAIL, customer.id, 'DELIVERED');

      const res = await t.http
        .post('/api/promotions/vouchers/apply')
        .set(bearer(customer.accessToken))
        .send({
          code: 'CHAOBANMOI',
          subtotal: '200000',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('đơn hàng đầu tiên');
    });

    it('từ chối FREYAVIP khi khách chưa đạt điều kiện chi tiêu VIP', async () => {
      const customer = await customerSession();

      await t.prisma.voucher.create({
        data: {
          code: 'FREYAVIP',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(20),
          maxDiscountAmount: new Decimal(100000),
          minOrderAmount: new Decimal(400000),
        },
      });

      // Đã có đơn nhưng chỉ 500k (< 2M)
      await createDummyOrder(
        'SMALL-ORD',
        CUSTOMER_EMAIL,
        customer.id,
        'DELIVERED',
        new Decimal(500000),
      );

      const res = await t.http
        .post('/api/promotions/vouchers/apply')
        .set(bearer(customer.accessToken))
        .send({
          code: 'FREYAVIP',
          subtotal: '500000',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('VIP');
    });

    it('áp dụng thành công FREYAVIP khi khách hàng đã chi tiêu >= 2.000.000đ', async () => {
      const customer = await customerSession();

      await t.prisma.voucher.create({
        data: {
          code: 'FREYAVIP',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(20),
          maxDiscountAmount: new Decimal(100000),
          minOrderAmount: new Decimal(400000),
        },
      });

      // Đạt 2.500.000đ chi tiêu
      await createDummyOrder(
        'BIG-ORD',
        CUSTOMER_EMAIL,
        customer.id,
        'DELIVERED',
        new Decimal(2500000),
      );

      const res = await t.http
        .post('/api/promotions/vouchers/apply')
        .set(bearer(customer.accessToken))
        .send({
          code: 'FREYAVIP',
          subtotal: '600000',
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discountAmount).toBe('100000'); // 20% cua 600k la 120k, bi cap 100k
    });
  });

  describe('Dynamic Cart Evaluation (POST /api/promotions/evaluate)', () => {
    it('tính toán khuyến mãi động nhiều bậc (TieredDiscountStrategy) cho giỏ hàng', async () => {
      await t.prisma.promotion.create({
        data: {
          name: 'Khuyến mãi bậc thang mùa đông',
          status: 'ACTIVE',
          discountType: DiscountType.PERCENTAGE,
          discountValue: new Decimal(10),
          conditions: {
            type: 'AND',
            rules: [{ type: 'CATEGORY', categorySlugs: ['ao-khoac'] }],
            tiers: [
              { minAmount: 300000, discount: 30000 },
              { minAmount: 600000, discount: 70000 },
              { minAmount: 1000000, discount: 150000 },
            ],
          },
        },
      });

      // Mức 1: Tạm tính 400.000đ -> nhận giảm 30.000đ
      const resTier1 = await t.http.post('/api/promotions/evaluate').send({
        subtotal: '400000',
        items: [
          {
            variantId: '00000000-0000-4000-8000-000000000001',
            categorySlug: 'ao-khoac',
            price: '400000',
            quantity: 1,
          },
        ],
      });

      expect(resTier1.status).toBe(200);
      expect(resTier1.body.applicablePromotions).toHaveLength(1);
      expect(resTier1.body.bestPromotion.discountAmount).toBe('30000');
      expect(resTier1.body.bestPromotion.finalAmount).toBe('370000');

      // Mức 2: Tạm tính 700.000đ -> nhận giảm 70.000đ
      const resTier2 = await t.http.post('/api/promotions/evaluate').send({
        subtotal: '700000',
        items: [
          {
            variantId: '00000000-0000-4000-8000-000000000001',
            categorySlug: 'ao-khoac',
            price: '700000',
            quantity: 1,
          },
        ],
      });

      expect(resTier2.status).toBe(200);
      expect(resTier2.body.bestPromotion.discountAmount).toBe('70000');

      // Trường hợp không có sản phẩm khớp danh mục quy định
      const resNoMatch = await t.http.post('/api/promotions/evaluate').send({
        subtotal: '700000',
        items: [
          {
            variantId: '00000000-0000-4000-8000-000000000002',
            categorySlug: 'phu-kien',
            price: '700000',
            quantity: 1,
          },
        ],
      });

      expect(resNoMatch.status).toBe(200);
      expect(resNoMatch.body.applicablePromotions).toHaveLength(0);
      expect(resNoMatch.body.bestPromotion).toBeNull();
    });
  });

  describe('Admin Promotion CRUD & Dynamic Conditions Management (UC-10.1)', () => {
    it('Admin tạo, xem chi tiết và ngưng kích hoạt khuyến mãi với conditions JSON', async () => {
      const admin = await adminSession();

      // 1. Tạo khuyến mãi với JSONB conditions
      const createRes = await t.http
        .post('/api/admin/promotions')
        .set(bearer(admin.accessToken))
        .send({
          name: 'Flash Sale Black Friday',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '25',
          maxDiscountAmount: '200000',
          minOrderAmount: '500000',
          conditions: {
            type: 'AND',
            rules: [
              { type: 'MIN_ITEM_COUNT', minItems: 2 },
              { type: 'CUSTOMER_SEGMENT', segment: 'VIP_CUSTOMER' },
            ],
          },
        });

      expect(createRes.status).toBe(201);
      const promoId = createRes.body.id;
      expect(createRes.body.conditions.type).toBe('AND');

      // 2. Lấy chi tiết khuyến mãi
      const getRes = await t.http
        .get(`/api/admin/promotions/${promoId}`)
        .set(bearer(admin.accessToken));

      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Flash Sale Black Friday');

      // 3. Ngưng kích hoạt qua DELETE
      const deleteRes = await t.http
        .delete(`/api/admin/promotions/${promoId}`)
        .set(bearer(admin.accessToken));

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.ok).toBe(true);

      const checkInactive = await t.prisma.promotion.findUnique({ where: { id: promoId } });
      expect(checkInactive?.status).toBe('INACTIVE');
    });
  });
});
