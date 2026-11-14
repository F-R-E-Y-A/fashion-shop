import { randomBytes, randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { ReportingService } from '../src/modules/reporting/reporting.service.js';
import {
  REPORTING_ADVISORY_LOCK_ID,
  ReportingAggregatorService,
} from '../src/modules/reporting/reporting-aggregator.service.js';
import { PaymentsSourceReader } from '../src/modules/reporting/source-readers/payments-source.reader.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Admin Reports HTTP API (Issue #108 - Reporting Read Model)', () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;
  let customerId: string;
  let variantId: string;
  let productId: string;

  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });
  const asCustomer = () => ({ Authorization: `Bearer ${customerToken}` });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);

    // 1. Tao Admin
    const adminUser = await t.prisma.user.create({
      data: {
        email: 'admin.report@example.test',
        status: 'ACTIVE',
        passwordHash: 'admin-hash',
      },
    });
    await grantAdminRole(t.prisma, adminUser.email);
    adminToken = await t.app.get(JwtService).signAsync({
      sub: adminUser.id,
      ver: adminUser.authVersion,
    });

    // 2. Tao Customer
    const customerUser = await t.prisma.user.create({
      data: {
        email: 'customer.report@example.test',
        status: 'ACTIVE',
        passwordHash: 'cust-hash',
      },
    });
    customerId = customerUser.id;
    customerToken = await t.app.get(JwtService).signAsync({
      sub: customerUser.id,
      ver: customerUser.authVersion,
    });

    // 3. Lay variant va product san co tu seed
    const variant = await t.prisma.productVariant.findFirstOrThrow({
      include: { product: true },
    });
    variantId = variant.id;
    productId = variant.productId;
  });

  describe('1. Quyen truy cap va Header Cache-Control', () => {
    it('tu choi khach vang lai bang 401 khi truy cap /api/admin/reports/summary', async () => {
      const res = await t.http.get('/api/admin/reports/summary');
      expect(res.status).toBe(401);
    });

    it('tu choi khach hang thuong (CUSTOMER) bang 403', async () => {
      const res = await t.http.get('/api/admin/reports/summary').set(asCustomer());
      expect(res.status).toBe(403);
    });

    it('cho phep ADMIN truy cap va co header Cache-Control: no-store', async () => {
      const res = await t.http.get('/api/admin/reports/summary').set(asAdmin());
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('2. Validation dau vao (strict calendar & constraints)', () => {
    it('tu choi ngay lich sai hoac sai dinh dang bang 400', async () => {
      const res1 = await t.http
        .get('/api/admin/reports/summary?from=2026-02-31&to=2026-03-05')
        .set(asAdmin());
      expect(res1.status).toBe(400);

      const res2 = await t.http
        .get('/api/admin/reports/summary?from=14-10-2026&to=2026-11-12')
        .set(asAdmin());
      expect(res2.status).toBe(400);
    });

    it('tu choi khi from > to bang 400', async () => {
      const res = await t.http
        .get('/api/admin/reports/summary?from=2026-11-15&to=2026-11-12')
        .set(asAdmin());
      expect(res.status).toBe(400);
    });

    it('tu choi khoang cach ngay > 366 ngay bang 400', async () => {
      const res = await t.http
        .get('/api/admin/reports/summary?from=2024-01-01&to=2025-01-10')
        .set(asAdmin());
      expect(res.status).toBe(400);
    });

    it('tu choi top khong thuoc 5, 10, 20 bang 400', async () => {
      const res = await t.http.get('/api/admin/reports/summary?top=15').set(asAdmin());
      expect(res.status).toBe(400);
    });

    it('tu choi tham so la ngoai allowlist bang 400', async () => {
      const res = await t.http.get('/api/admin/reports/summary?unknownParam=attack').set(asAdmin());
      expect(res.status).toBe(400);
    });
  });

  describe('3. Trang thai NOT_READY va Snapshot Ban dau', () => {
    it('khi chua chay tong hop bao cao nao, tra ve NOT_READY va metadata null', async () => {
      const res = await t.http.get('/api/admin/reports/summary').set(asAdmin());
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('NOT_READY');
      expect(res.body.metadata).toBeNull();
      expect(res.body.summary).toBeNull();
      expect(res.body.dailyMoney).toEqual([]);
      expect(res.body.ordersByStatus).toEqual([]);
      expect(res.body.topDeliveredProducts).toEqual([]);
      expect(res.body.range.timezone).toBe('Asia/Ho_Chi_Minh');
    });
  });

  describe('4. Tinh toan So lieu va Bang chung Thu/Hoan thuc te', () => {
    it('ghi nhan chinh xac tien thu VNPAY, COD va hoan tien, tinh thu rong am khi chi co hoan', async () => {
      // 1. Tao Order 1 (COD)
      const order1 = await t.prisma.order.create({
        data: {
          userId: customerId,
          customerEmail: 'customer.report@example.test',
          shippingAddressSnapshot: { recipientName: 'Khách test' },
          orderCode: `ORD-COD-${randomBytes(4).toString('hex')}`,
          status: 'DELIVERED',
          totalAmount: '450000.00',
          subtotalAmount: '420000.00',
          shippingFeeAmount: '30000.00',
          discountAmount: '0.00',
          checkoutFingerprint: randomUUID(),
          items: {
            create: [
              {
                productVariantId: variantId,
                quantity: 2,
                unitPrice: '210000.00',
                productSnapshot: { name: 'Áo thun basic test' },
              },
            ],
          },
          statusHistory: {
            create: [
              { status: 'PENDING_CONFIRMATION' },
              { status: 'DELIVERED', createdAt: new Date('2026-11-10T03:00:00Z') },
            ],
          },
        },
      });

      // Tao Payment COD thanh cong voi receipt COD:*
      await t.prisma.payment.create({
        data: {
          orderId: order1.id,
          method: 'COD',
          gateway: 'COD',
          status: 'SUCCEEDED',
          amount: '450000.00',
          reference: `REF-COD-${randomUUID()}`,
          transactions: {
            create: [
              {
                gateway: 'COD',
                externalTransactionId: `COD:${order1.orderCode}:del123`,
                status: 'PROCESSED',
                createdAt: new Date('2026-11-10T03:00:00Z'), // ~10:00 sang ngay 10/11 gio VN
                payload: { collectedAt: '2026-11-10T03:00:00Z' },
              },
            ],
          },
        },
      });

      // 2. Tao Order 2 (VNPAY)
      const order2 = await t.prisma.order.create({
        data: {
          userId: customerId,
          customerEmail: 'customer.report@example.test',
          shippingAddressSnapshot: { recipientName: 'Khách test' },
          orderCode: `ORD-VNP-${randomBytes(4).toString('hex')}`,
          status: 'CONFIRMED',
          totalAmount: '800000.00',
          subtotalAmount: '800000.00',
          shippingFeeAmount: '0.00',
          discountAmount: '0.00',
          checkoutFingerprint: randomUUID(),
          items: {
            create: [
              {
                productVariantId: variantId,
                quantity: 1,
                unitPrice: '800000.00',
                productSnapshot: { name: 'Áo thun basic test' },
              },
            ],
          },
        },
      });

      // Tao Payment VNPAY thanh cong voi receipt la so
      const paymentVnp = await t.prisma.payment.create({
        data: {
          orderId: order2.id,
          method: 'ONLINE',
          gateway: 'VNPAY',
          status: 'SUCCEEDED',
          amount: '800000.00',
          reference: `REF-VNP-${randomUUID()}`,
          transactions: {
            create: [
              {
                gateway: 'VNPAY',
                externalTransactionId: 'INIT:txn123',
                status: 'RECEIVED',
              },
              {
                gateway: 'VNPAY',
                externalTransactionId: '15928374', // ma giao dich VNPAY hop le
                status: 'PROCESSED',
                createdAt: new Date('2026-11-10T05:00:00Z'),
                payload: { vnp_ResponseCode: '00', vnp_TransactionStatus: '00' },
              },
            ],
          },
        },
      });

      // 3. Tao giao dich hoan tien vao ngay 11/11
      await t.prisma.paymentTransaction.create({
        data: {
          paymentId: paymentVnp.id,
          gateway: 'VNPAY',
          externalTransactionId: 'REFUND:ref-001',
          status: 'PROCESSED',
          createdAt: new Date('2026-11-11T04:00:00Z'),
          payload: {
            refundedAmount: '200000.00',
            reason: 'Khách yêu cầu hoàn một phần',
          },
        },
      });

      // 4. Tao don hang thu 3 co payment FAILED (khong duoc tinh)
      const order3 = await t.prisma.order.create({
        data: {
          userId: customerId,
          customerEmail: 'customer.report@example.test',
          shippingAddressSnapshot: { recipientName: 'Khách test' },
          orderCode: `ORD-FAIL-${randomBytes(4).toString('hex')}`,
          status: 'CANCELLED',
          totalAmount: '300000.00',
          subtotalAmount: '300000.00',
          shippingFeeAmount: '0.00',
          discountAmount: '0.00',
          checkoutFingerprint: randomUUID(),
        },
      });

      await t.prisma.payment.create({
        data: {
          orderId: order3.id,
          method: 'ONLINE',
          gateway: 'MOMO',
          status: 'FAILED',
          amount: '300000.00',
          transactions: {
            create: [
              {
                gateway: 'MOMO',
                externalTransactionId: `FAIL:${order3.orderCode}:49`,
                status: 'PROCESSED',
                payload: { resultCode: '49' },
              },
            ],
          },
        },
      });

      // Chay Aggregator tong hop snapshot
      const aggregator = t.app.get(ReportingAggregatorService);
      const refreshRes = await aggregator.refreshSnapshot();
      expect(refreshRes.success).toBe(true);

      // Goi API Summary
      const res = await t.http
        .get('/api/admin/reports/summary?from=2026-11-10&to=2026-11-11')
        .set(asAdmin());

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
      expect(res.body.metadata.snapshotVersion).toBe('1');

      // Tong tien da thu: 450,000 (COD) + 800,000 (VNPAY) = 1,250,000.00 (khong tinh 300,000 FAILED)
      expect(res.body.summary.totalCollectedAmount).toBe('1250000.00');
      // Tong tien da hoan: 200,000.00
      expect(res.body.summary.totalRefundedAmount).toBe('200000.00');
      // Thu rong: 1,250,000 - 200,000 = 1,050,000.00
      expect(res.body.summary.netRevenueAmount).toBe('1050000.00');

      // Ngay 10/11: thu 1,250,000, hoan 0, rong 1,250,000
      const day10 = res.body.dailyMoney.find((d: { date: string }) => d.date === '2026-11-10');
      expect(day10).toBeDefined();
      expect(day10.collectedAmount).toBe('1250000.00');
      expect(day10.refundedAmount).toBe('0.00');
      expect(day10.netAmount).toBe('1250000.00');

      // Ngay 11/11: thu 0, hoan 200,000, rong -200,000.00 (am ro rang)
      const day11 = res.body.dailyMoney.find((d: { date: string }) => d.date === '2026-11-11');
      expect(day11).toBeDefined();
      expect(day11.collectedAmount).toBe('0.00');
      expect(day11.refundedAmount).toBe('200000.00');
      expect(day11.netAmount).toBe('-200000.00');

      // Top delivered products: chi order 1 DELIVERED voi quantity = 2
      expect(res.body.topDeliveredProducts).toHaveLength(1);
      expect(res.body.topDeliveredProducts[0].productId).toBe(productId);
      expect(res.body.topDeliveredProducts[0].deliveredQuantity).toBe(2);
      expect(res.body.topDeliveredProducts[0].deliveredRevenueAmount).toBe('420000.00'); // 2 * 210,000
    });
  });

  describe('5. Advisory Lock va Tinh Nguyen tu cua Snapshot', () => {
    it('advisory lock chan tien trinh tong hop chay trung', async () => {
      const aggregator = t.app.get(ReportingAggregatorService);

      // Gia lap mot transaction dang giu lock
      await t.prisma.$transaction(async (tx) => {
        const lock = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${REPORTING_ADVISORY_LOCK_ID}) AS locked
        `;
        expect(lock[0]?.locked).toBe(true);

        // Goi aggregator khi lock dang bi giu -> phai bao bo qua
        const concurrentResult = await aggregator.refreshSnapshot();
        expect(concurrentResult.success).toBe(false);
        expect(concurrentResult.skippedDueToLock).toBe(true);
      });
    });
  });

  describe('6. Regression Tests Codex Review #108 - Consistent Snapshot & Data Evidence', () => {
    async function createTestPayment(status: 'PENDING' | 'SUCCEEDED' = 'SUCCEEDED') {
      const o = await t.prisma.order.create({
        data: {
          orderCode: randomUUID(),
          customerEmail: 'fixture@example.test',
          shippingAddressSnapshot: {},
          status: 'SHIPPED',
          totalAmount: '100',
          subtotalAmount: '100',
          discountAmount: '0',
          shippingFeeAmount: '0',
        },
      });
      const p = await t.prisma.payment.create({
        data: {
          orderId: o.id,
          method: 'COD',
          gateway: 'COD',
          status,
          amount: '100',
        },
      });
      return { o, p };
    }

    const txDate = new Date('2026-11-10T10:00:00Z');
    const period = { from: '2026-11-10', to: '2026-11-10' };

    it('must not publish zero as NORMAL when a successful payment has no confirming receipt', async () => {
      await createTestPayment();
      const result = await t.app.get(ReportingAggregatorService).refreshSnapshot();
      expect(result.success).toBe(false);
    });

    it('must not silently treat a confirmed refund without amount as zero', async () => {
      const { p } = await createTestPayment();
      await t.prisma.paymentTransaction.createMany({
        data: [
          {
            paymentId: p.id,
            gateway: 'COD',
            externalTransactionId: 'COD:' + randomUUID(),
            status: 'PROCESSED',
            createdAt: txDate,
            payload: { collectedAt: txDate.toISOString() },
          },
          {
            paymentId: p.id,
            gateway: 'COD',
            externalTransactionId: 'REFUND:' + randomUUID(),
            status: 'PROCESSED',
            createdAt: txDate,
            payload: {},
          },
        ],
      });
      const result = await t.app.get(ReportingAggregatorService).refreshSnapshot();
      expect(result.success).toBe(false);
    });

    it('summary must not mix metadata version1 and money from version2 when publish occurs after metadata SELECT', async () => {
      await t.prisma.reportSnapshotMetadata.create({
        data: {
          id: 'singleton',
          snapshotVersion: 1n,
          asOf: txDate,
          lastCompletedAt: txDate,
          metricDefinitionVersion: '1',
        },
      });
      await t.prisma.dailyRevenue.create({
        data: {
          reportDate: new Date('2026-11-10'),
          orderCount: 1,
          revenueAmount: '100',
          refundedAmount: '0',
          refreshedAt: txDate,
        },
      });

      let published = false;
      const extended = t.prisma.$extends({
        query: {
          reportSnapshotMetadata: {
            async findUnique({ args, query }) {
              const res = await query(args);
              await t.prisma.$transaction([
                t.prisma.dailyRevenue.updateMany({ data: { revenueAmount: '200' } }),
                t.prisma.reportSnapshotMetadata.update({
                  where: { id: 'singleton' },
                  data: { snapshotVersion: 2n },
                }),
              ]);
              published = true;
              return res;
            },
          },
        },
      });

      const service = new ReportingService(extended as unknown as PrismaService);
      const r = await service.getSummaryReport(period);
      expect(published).toBe(true);
      expect([r.metadata?.snapshotVersion, r.summary?.totalCollectedAmount]).toEqual([
        '1',
        '100.00',
      ]);
    });

    it('metadata must use the same pinned transaction as facts when a publish precedes metadata SELECT', async () => {
      await t.prisma.reportSnapshotMetadata.create({
        data: {
          id: 'singleton',
          snapshotVersion: 1n,
          asOf: txDate,
          lastCompletedAt: txDate,
          metricDefinitionVersion: '1',
        },
      });
      await t.prisma.dailyRevenue.create({
        data: {
          reportDate: new Date('2026-11-10'),
          orderCount: 1,
          revenueAmount: '100',
          refundedAmount: '0',
          refreshedAt: txDate,
        },
      });

      let published = false;
      const extended = t.prisma.$extends({
        query: {
          reportSnapshotMetadata: {
            async findUnique({ args, query }) {
              await t.prisma.$transaction([
                t.prisma.dailyRevenue.updateMany({ data: { revenueAmount: '200' } }),
                t.prisma.reportSnapshotMetadata.update({
                  where: { id: 'singleton' },
                  data: { snapshotVersion: 2n },
                }),
              ]);
              published = true;
              return query(args);
            },
          },
        },
      });

      const service = new ReportingService(extended as unknown as PrismaService);
      const r = await service.getSummaryReport(period);
      expect(published).toBe(true);
      const v = r.metadata?.snapshotVersion;
      expect(r.summary?.totalCollectedAmount).toBe(v === '1' ? '100.00' : '200.00');
      expect([v, r.summary?.totalCollectedAmount]).toEqual(['2', '200.00']);
    });

    it('read model must remain consistent even when publish occurs between dailyRevenue and ordersByStatus', async () => {
      await t.prisma.reportSnapshotMetadata.create({
        data: {
          id: 'singleton',
          snapshotVersion: 1n,
          asOf: txDate,
          lastCompletedAt: txDate,
          metricDefinitionVersion: '1',
        },
      });
      await t.prisma.dailyRevenue.create({
        data: {
          reportDate: new Date('2026-11-10'),
          orderCount: 1,
          revenueAmount: '100',
          refundedAmount: '0',
          refreshedAt: txDate,
        },
      });
      await t.prisma.ordersByStatus.create({
        data: {
          reportDate: new Date('2026-11-10'),
          orderStatus: 'DELIVERED',
          orderCount: 1,
          refreshedAt: txDate,
        },
      });

      let publishedBetweenFacts = false;
      const extended = t.prisma.$extends({
        query: {
          dailyRevenue: {
            async findMany({ args, query }) {
              const res = await query(args);
              await t.prisma.$transaction([
                t.prisma.dailyRevenue.updateMany({ data: { revenueAmount: '200' } }),
                t.prisma.ordersByStatus.updateMany({ data: { orderCount: 5 } }),
                t.prisma.reportSnapshotMetadata.update({
                  where: { id: 'singleton' },
                  data: { snapshotVersion: 2n },
                }),
              ]);
              publishedBetweenFacts = true;
              return res;
            },
          },
        },
      });

      const service = new ReportingService(extended as unknown as PrismaService);
      const r = await service.getSummaryReport(period);
      expect(publishedBetweenFacts).toBe(true);
      expect(r.metadata?.snapshotVersion).toBe('1');
      expect(r.summary?.totalCollectedAmount).toBe('100.00');
      const deliveredStatus = r.ordersByStatus.find((s) => s.status === 'DELIVERED');
      expect(deliveredStatus?.count).toBe(1);
    });

    it('malformed canonical refund amount must not publish NaN using fallback validation', async () => {
      const o = await t.prisma.order.create({
        data: {
          orderCode: randomUUID(),
          customerEmail: 'fixture@example.test',
          shippingAddressSnapshot: {},
          status: 'SHIPPED',
          totalAmount: '100',
          subtotalAmount: '100',
          discountAmount: '0',
          shippingFeeAmount: '0',
        },
      });
      const p = await t.prisma.payment.create({
        data: {
          orderId: o.id,
          method: 'COD',
          gateway: 'COD',
          status: 'SUCCEEDED',
          amount: '100',
        },
      });
      await t.prisma.paymentTransaction.createMany({
        data: [
          {
            paymentId: p.id,
            gateway: 'COD',
            externalTransactionId: 'COD:' + randomUUID(),
            status: 'PROCESSED',
            payload: {},
          },
          {
            paymentId: p.id,
            gateway: 'COD',
            externalTransactionId: 'REFUND:' + randomUUID(),
            status: 'PROCESSED',
            payload: { refundedAmount: 'NaN', vnp_Amount: '10000' },
          },
        ],
      });
      const r = await t.app.get(ReportingAggregatorService).refreshSnapshot();
      expect(r.success).toBe(false);
    });

    it('refresh sources must share one database snapshot across concurrent payment and status changes', async () => {
      const { o, p } = await createTestPayment('PENDING');
      const reader = t.app.get(PaymentsSourceReader);
      const original = reader.getDailyMoneyFacts.bind(reader);
      let changed = false;
      vi.spyOn(reader, 'getDailyMoneyFacts').mockImplementationOnce(async (tx) => {
        const facts = await original(tx);
        await t.prisma.$transaction([
          t.prisma.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED' } }),
          t.prisma.paymentTransaction.create({
            data: {
              paymentId: p.id,
              gateway: 'COD',
              externalTransactionId: 'COD:' + randomUUID(),
              status: 'PROCESSED',
              createdAt: txDate,
              payload: { collectedAt: txDate.toISOString() },
            },
          }),
          t.prisma.order.update({ where: { id: o.id }, data: { status: 'DELIVERED' } }),
        ]);
        changed = true;
        return facts;
      });

      const result = await t.app.get(ReportingAggregatorService).refreshSnapshot();
      expect(result.success).toBe(true);
      expect(changed).toBe(true);
      const delivered = await t.prisma.ordersByStatus.findFirst({
        where: { orderStatus: 'DELIVERED' },
      });
      expect(delivered).toBeNull();
    });

    it('strict API rejects exponent top, unbounded defaulted range and 367 inclusive days', async () => {
      const queries = ['top=1e1', 'from=2000-01-01', 'from=2025-01-01&to=2026-01-02'];
      const codes = [];
      for (const q of queries) {
        const r = await t.http.get('/api/admin/reports/summary?' + q).set(asAdmin());
        codes.push(r.status);
      }
      expect(codes).toEqual([400, 400, 400]);
    });
  });
});
