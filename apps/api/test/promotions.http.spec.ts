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

  async function createDummyOrder(codeSuffix: string, customerEmail = 'khach@example.test') {
    return t.prisma.order.create({
      data: {
        orderCode: `ORD-${Date.now()}-${codeSuffix}`,
        customerEmail,
        status: 'PENDING_CONFIRMATION',
        shippingAddressSnapshot: {},
        subtotalAmount: new Decimal(500000),
        discountAmount: new Decimal(0),
        shippingFeeAmount: new Decimal(30000),
        totalAmount: new Decimal(530000),
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
});
