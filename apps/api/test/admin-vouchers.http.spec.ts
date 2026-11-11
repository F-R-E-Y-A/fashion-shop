import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { DiscountType, VoucherStatus } from '../src/modules/promotions/promotions.types.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Admin Vouchers HTTP API (UC-10.2)', () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });
  const customerAuth = () => ({ Authorization: `Bearer ${customerToken}` });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();

    const adminUser = await t.prisma.user.create({
      data: {
        email: 'admin.voucher@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    await grantAdminRole(t.prisma, adminUser.email);
    adminToken = await t.app
      .get(JwtService)
      .signAsync({ sub: adminUser.id, ver: adminUser.authVersion });

    const customerUser = await t.prisma.user.create({
      data: {
        email: 'customer.voucher@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    customerToken = await t.app
      .get(JwtService)
      .signAsync({ sub: customerUser.id, ver: customerUser.authVersion });
  });

  describe('UC-10.2/AC1 Phân quyền & Header an toàn', () => {
    it('từ chối request không có token bằng 401', async () => {
      await t.http.get('/api/admin/vouchers').expect(401);
      await t.http.get('/api/admin/vouchers/11111111-1111-4111-8111-111111111111').expect(401);
      await t.http.post('/api/admin/vouchers').send({ code: 'TEST' }).expect(401);
      await t.http
        .patch('/api/admin/vouchers/11111111-1111-4111-8111-111111111111')
        .send({ status: 'ACTIVE' })
        .expect(401);
    });

    it('từ chối khách hàng không có quyền ADMIN bằng 403', async () => {
      await t.http.get('/api/admin/vouchers').set(customerAuth()).expect(403);
      await t.http
        .get('/api/admin/vouchers/11111111-1111-4111-8111-111111111111')
        .set(customerAuth())
        .expect(403);
      await t.http
        .post('/api/admin/vouchers')
        .set(customerAuth())
        .send({ code: 'TEST' })
        .expect(403);
      await t.http
        .patch('/api/admin/vouchers/11111111-1111-4111-8111-111111111111')
        .set(customerAuth())
        .send({ status: 'ACTIVE' })
        .expect(403);
    });

    it('trả Cache-Control: no-store cho mọi endpoint admin voucher', async () => {
      const listRes = await t.http.get('/api/admin/vouchers').set(adminAuth()).expect(200);
      expect(listRes.headers['cache-control']).toContain('no-store');

      const createRes = await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'FREYANOSTORE',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: '20000',
        })
        .expect(201);
      expect(createRes.headers['cache-control']).toContain('no-store');

      const voucherId = createRes.body.id;
      const getRes = await t.http
        .get(`/api/admin/vouchers/${voucherId}`)
        .set(adminAuth())
        .expect(200);
      expect(getRes.headers['cache-control']).toContain('no-store');

      const patchRes = await t.http
        .patch(`/api/admin/vouchers/${voucherId}`)
        .set(adminAuth())
        .send({ status: VoucherStatus.INACTIVE })
        .expect(200);
      expect(patchRes.headers['cache-control']).toContain('no-store');
    });

    it('từ chối UUID không đúng định dạng bằng 400 Bad Request', async () => {
      await t.http.get('/api/admin/vouchers/not-a-uuid').set(adminAuth()).expect(400);
      await t.http.patch('/api/admin/vouchers/not-a-uuid').set(adminAuth()).send({}).expect(400);
    });

    it('từ chối query parameters lạ bằng 400 Bad Request', async () => {
      await t.http.get('/api/admin/vouchers?unknownParam=value').set(adminAuth()).expect(400);
    });

    it('từ chối tham số phân trang dạng số mũ, số âm, số thực hoặc lặp tham số bằng 400', async () => {
      // 1e3 exponent
      await t.http.get('/api/admin/vouchers?page=1e3').set(adminAuth()).expect(400);
      await t.http.get('/api/admin/vouchers?pageSize=1e1').set(adminAuth()).expect(400);
      // float
      await t.http.get('/api/admin/vouchers?page=1.5').set(adminAuth()).expect(400);
      // negative or zero
      await t.http.get('/api/admin/vouchers?page=0').set(adminAuth()).expect(400);
      await t.http.get('/api/admin/vouchers?page=-5').set(adminAuth()).expect(400);
      // duplicate query parameters
      await t.http.get('/api/admin/vouchers?page=1&page=2').set(adminAuth()).expect(400);
      await t.http.get('/api/admin/vouchers?pageSize=10&pageSize=20').set(adminAuth()).expect(400);
      await t.http.get('/api/admin/vouchers?search=a&search=b').set(adminAuth()).expect(400);
      await t.http
        .get('/api/admin/vouchers?status=ACTIVE&status=INACTIVE')
        .set(adminAuth())
        .expect(400);
    });
  });

  describe('UC-10.2/AC2 Danh sách & Phân trang', () => {
    beforeEach(async () => {
      // Seed 3 voucher để kiểm tra bộ lọc
      await t.prisma.voucher.createMany({
        data: [
          {
            code: 'ACTIVE10',
            status: VoucherStatus.ACTIVE,
            discountType: DiscountType.PERCENTAGE,
            discountValue: 10,
          },
          {
            code: 'INACTIVE20',
            status: VoucherStatus.INACTIVE,
            discountType: DiscountType.PERCENTAGE,
            discountValue: 20,
          },
          {
            code: 'ACTIVEFIXED',
            status: VoucherStatus.ACTIVE,
            discountType: DiscountType.FIXED_AMOUNT,
            discountValue: 50000,
          },
        ],
      });
    });

    it('liệt kê danh sách voucher có phân trang', async () => {
      const res = await t.http
        .get('/api/admin/vouchers?page=1&pageSize=2')
        .set(adminAuth())
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.totalPages).toBe(2);
    });

    it('lọc danh sách theo trạng thái ACTIVE và INACTIVE', async () => {
      const activeRes = await t.http
        .get('/api/admin/vouchers?status=ACTIVE')
        .set(adminAuth())
        .expect(200);
      expect(activeRes.body.items).toHaveLength(2);
      expect(activeRes.body.items.every((v: { status: string }) => v.status === 'ACTIVE')).toBe(
        true,
      );

      const inactiveRes = await t.http
        .get('/api/admin/vouchers?status=INACTIVE')
        .set(adminAuth())
        .expect(200);
      expect(inactiveRes.body.items).toHaveLength(1);
      expect(inactiveRes.body.items[0].code).toBe('INACTIVE20');
    });

    it('tìm kiếm theo mã voucher (không phân biệt hoa thường)', async () => {
      const res = await t.http.get('/api/admin/vouchers?search=fixed').set(adminAuth()).expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].code).toBe('ACTIVEFIXED');
    });
  });

  describe('UC-10.2/AC3 Tạo mới voucher & Ràng buộc toàn vẹn', () => {
    it('tạo voucher thành công với đầy đủ các trường cấu hình', async () => {
      const res = await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'FREYASPRING',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: '15',
          maxDiscountAmount: '150000',
          minOrderAmount: '300000',
          usageLimit: 100,
          perUserLimit: 1,
          startsAt: '2026-03-01T00:00:00.000Z',
          endsAt: '2026-03-31T23:59:59.000Z',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.code).toBe('FREYASPRING');
      expect(res.body.discountValue).toBe('15.00');
      expect(res.body.maxDiscountAmount).toBe('150000.00');
      expect(res.body.minOrderAmount).toBe('300000.00');
      expect(res.body.usageLimit).toBe(100);
      expect(res.body.perUserLimit).toBe(1);
      expect(res.body.usageCount).toBe(0);
    });

    it('từ chối khi phần trăm giảm giá vượt quá 100% bằng 400', async () => {
      await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'OVER100',
          discountType: DiscountType.PERCENTAGE,
          discountValue: '105',
        })
        .expect(400);
    });

    it('từ chối khi ngày kết thúc trước ngày bắt đầu bằng 400', async () => {
      await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'BADTIME',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: '10000',
          startsAt: '2026-12-31T00:00:00.000Z',
          endsAt: '2026-01-01T00:00:00.000Z',
        })
        .expect(400);
    });

    it('trả về 409 Conflict khi tạo mã voucher đã tồn tại', async () => {
      await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'DUPLICATECODE',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: '20000',
        })
        .expect(201);

      const conflictRes = await t.http
        .post('/api/admin/vouchers')
        .set(adminAuth())
        .send({
          code: 'duplicatecode', // check case insensitivity
          discountType: DiscountType.PERCENTAGE,
          discountValue: '10',
        })
        .expect(409);

      expect(conflictRes.body.message).toContain('đã tồn tại');
    });
  });

  describe('UC-10.2/AC4 Cập nhật & Kiểm soát tương tranh CAS', () => {
    let voucherId: string;
    let initialUpdatedAt: string;

    beforeEach(async () => {
      const v = await t.prisma.voucher.create({
        data: {
          code: 'VOUCHERCAS',
          status: VoucherStatus.ACTIVE,
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10,
        },
      });
      voucherId = v.id;
      initialUpdatedAt = v.updatedAt.toISOString();
    });

    it('trả về 404 khi voucher không tồn tại', async () => {
      await t.http
        .get('/api/admin/vouchers/00000000-0000-4000-8000-000000000000')
        .set(adminAuth())
        .expect(404);

      await t.http
        .patch('/api/admin/vouchers/00000000-0000-4000-8000-000000000000')
        .set(adminAuth())
        .send({ status: VoucherStatus.INACTIVE })
        .expect(404);
    });

    it('trả về 409 Conflict khi expectedUpdatedAt không khớp (CAS mismatch)', async () => {
      const staleUpdatedAt = '2026-11-10T00:00:00.000Z';
      const res = await t.http
        .patch(`/api/admin/vouchers/${voucherId}`)
        .set(adminAuth())
        .send({
          status: VoucherStatus.INACTIVE,
          expectedUpdatedAt: staleUpdatedAt,
        })
        .expect(409);

      expect(res.body.message).toContain('đã được thay đổi trên máy chủ');
    });

    it('cập nhật thành công khi expectedUpdatedAt khớp và tăng đơn điệu updatedAt', async () => {
      const res = await t.http
        .patch(`/api/admin/vouchers/${voucherId}`)
        .set(adminAuth())
        .send({
          status: VoucherStatus.INACTIVE,
          expectedUpdatedAt: initialUpdatedAt,
        })
        .expect(200);

      expect(res.body.status).toBe('INACTIVE');
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(initialUpdatedAt).getTime(),
      );
    });

    it('no-op: không tăng updatedAt khi dữ liệu gửi lên trùng hoàn toàn với dữ liệu hiện tại', async () => {
      const res = await t.http
        .patch(`/api/admin/vouchers/${voucherId}`)
        .set(adminAuth())
        .send({
          status: VoucherStatus.ACTIVE,
          expectedUpdatedAt: initialUpdatedAt,
        })
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.updatedAt).toBe(initialUpdatedAt);
    });
  });
});
