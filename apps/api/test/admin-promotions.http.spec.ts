import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DiscountType, PromotionStatus } from '../src/generated/prisma/enums.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const ADMIN_EMAIL = 'admin.promotions@example.test';
const CUSTOMER_EMAIL = 'customer.promotions@example.test';
const MISSING_UUID = '00000000-0000-4000-8000-000000000000';

describe('Admin Promotions Campaigns HTTP thật (UC-10.1)', () => {
  let t: TestApp;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();

    const adminSession = await authFlows(t).activateAndLogin(ADMIN_EMAIL);
    await grantAdminRole(t.prisma, ADMIN_EMAIL);
    adminToken = adminSession.accessToken;

    const custSession = await authFlows(t).activateAndLogin(CUSTOMER_EMAIL);
    customerToken = custSession.accessToken;
  });

  const adminGet = (path = '') =>
    t.http.get(`/api/admin/promotions${path}`).set('Authorization', `Bearer ${adminToken}`);

  const adminPost = (body: Record<string, unknown>) =>
    t.http.post('/api/admin/promotions').set('Authorization', `Bearer ${adminToken}`).send(body);

  const adminPatch = (id: string, body: Record<string, unknown>) =>
    t.http
      .patch(`/api/admin/promotions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  const adminDelete = (id: string) =>
    t.http.delete(`/api/admin/promotions/${id}`).set('Authorization', `Bearer ${adminToken}`);

  it('UC-10.1/AC1 Guard trước validation và header Cache-Control: no-store', async () => {
    // Không token -> 401
    await t.http.get('/api/admin/promotions').expect(401);
    await t.http.get('/api/admin/promotions/not-a-uuid').expect(401);

    // Token role CUSTOMER -> 403
    await t.http
      .get('/api/admin/promotions')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await t.http
      .get('/api/admin/promotions/not-a-uuid')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);

    // Admin token -> 200 kèm Cache-Control: no-store
    const listRes = await adminGet().expect(200);
    expect(listRes.headers['cache-control']).toBe('no-store');
  });

  it('UC-10.1/AC2 Strict pagination từ chối số mũ, số âm, số thực và tham số lặp', async () => {
    for (const invalidPage of ['1e3', '-1', '0', '1.5']) {
      await adminGet(`?page=${invalidPage}`).expect(400);
    }
    // Mảng tham số lặp
    await adminGet('?page=1&page=2').expect(400);

    // Phân trang hợp lệ
    const valid = await adminGet('?page=1&pageSize=10').expect(200);
    expect(valid.body.page).toBe(1);
    expect(valid.body.pageSize).toBe(10);
  });

  it('UC-10.1/AC3 Tạo mới chiến dịch, Idempotency bằng client UUID và cho phép cùng tên', async () => {
    const draftId = 'a0000000-0000-4000-a000-000000000001';
    const payload = {
      id: draftId,
      name: 'Chiến dịch Khai trương',
      discountType: 'PERCENTAGE',
      discountValue: '20',
      maxDiscountAmount: '100000',
      minOrderAmount: '300000',
      status: 'INACTIVE',
    };

    // Tạo mới lần đầu
    const res1 = await adminPost(payload).expect(201);
    expect(res1.body.id).toBe(draftId);
    expect(res1.body.name).toBe('Chiến dịch Khai trương');
    expect(res1.body.status).toBe('INACTIVE');
    expect(res1.body.discountValue).toBe('20.00');
    expect(res1.body.maxDiscountAmount).toBe('100000.00');

    // Thử gửi lại cùng draftId và cùng payload -> Idempotent thành công
    const res2 = await adminPost(payload).expect(201);
    expect(res2.body.id).toBe(draftId);
    expect(res2.body.name).toBe('Chiến dịch Khai trương');

    // Gửi lại cùng draftId nhưng payload khác biệt -> 409 Conflict
    await adminPost({
      ...payload,
      name: 'Chiến dịch Khác Hoàn Toàn',
    }).expect(409);

    // Chiến dịch thứ 2 CÙNG TÊN nhưng khác ID -> Tạo thành công (name không unique)
    const draftId2 = 'a0000000-0000-4000-a000-000000000002';
    const res3 = await adminPost({
      ...payload,
      id: draftId2,
    }).expect(201);
    expect(res3.body.id).toBe(draftId2);
    expect(res3.body.name).toBe('Chiến dịch Khai trương');
  });

  it('UC-10.1/AC4 Cập nhật với Concurrency Control (CAS), Monotonic Timestamp và No-op', async () => {
    const createRes = await adminPost({
      name: 'Chiến dịch Mùa hè',
      discountType: 'FIXED_AMOUNT',
      discountValue: '50000',
      status: 'ACTIVE',
    }).expect(201);

    const promoId = createRes.body.id;
    const initialUpdatedAt = createRes.body.updatedAt;

    // Cập nhật thành công với đúng expectedUpdatedAt
    const updateRes = await adminPatch(promoId, {
      name: 'Chiến dịch Mùa hè Rực rỡ',
      expectedUpdatedAt: initialUpdatedAt,
    }).expect(200);

    expect(updateRes.body.name).toBe('Chiến dịch Mùa hè Rực rỡ');
    const newUpdatedAt = updateRes.body.updatedAt;
    expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(new Date(initialUpdatedAt).getTime());

    // No-op: Gửi lại cùng giá trị -> không tăng updatedAt
    const noOpRes = await adminPatch(promoId, {
      name: 'Chiến dịch Mùa hè Rực rỡ',
      expectedUpdatedAt: newUpdatedAt,
    }).expect(200);
    expect(noOpRes.body.updatedAt).toBe(newUpdatedAt);

    // CAS Conflict: Gửi expectedUpdatedAt cũ -> 409 Conflict
    await adminPatch(promoId, {
      name: 'Sửa đè',
      expectedUpdatedAt: initialUpdatedAt, // token cũ
    }).expect(409);
  });

  it('UC-10.1/AC5 Chi tiết chiến dịch có header no-store và 404 nếu không tồn tại', async () => {
    await adminGet(`/${MISSING_UUID}`).expect(404);

    const created = await adminPost({
      name: 'Chiến dịch Tra cứu',
      discountType: 'PERCENTAGE',
      discountValue: '10',
    }).expect(201);

    const detail = await adminGet(`/${created.body.id}`).expect(200);
    expect(detail.headers['cache-control']).toBe('no-store');
    expect(detail.body.id).toBe(created.body.id);
  });

  it('UC-10.1/AC6 Bảo toàn điều kiện JsonB phức tạp khi cập nhật ở chế độ đơn giản', async () => {
    const complexConditions = {
      type: 'CUSTOMER_SEGMENT',
      segment: 'VIP',
      rules: [{ minSpent: 5000000, discount: 25 }],
    };

    const promo = await t.prisma.promotion.create({
      data: {
        name: 'Chiến dịch VIP Nâng cao',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '25',
        conditions: complexConditions,
        status: PromotionStatus.ACTIVE,
      },
    });

    // GET detail kiểm tra conditions nguyên vẹn
    const detail = await adminGet(`/${promo.id}`).expect(200);
    expect(detail.body.conditions).toEqual(complexConditions);

    // PATCH chỉ cập nhật trường cơ bản (name), không truyền conditions
    const updated = await adminPatch(promo.id, {
      name: 'Chiến dịch VIP Nâng cao (Đã đổi tên)',
      expectedUpdatedAt: detail.body.updatedAt,
    }).expect(200);

    expect(updated.body.name).toBe('Chiến dịch VIP Nâng cao (Đã đổi tên)');
    expect(updated.body.conditions).toEqual(complexConditions);

    // Xác minh trực tiếp trong cơ sở dữ liệu
    const dbRow = await t.prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(dbRow.conditions).toEqual(complexConditions);
  });

  it('UC-10.1/AC7 DELETE chuyển trạng thái INACTIVE an toàn', async () => {
    const created = await adminPost({
      name: 'Chiến dịch Sắp tắt',
      discountType: 'FIXED_AMOUNT',
      discountValue: '30000',
      status: 'ACTIVE',
    }).expect(201);

    await adminDelete(created.body.id).expect(200);

    const detail = await adminGet(`/${created.body.id}`).expect(200);
    expect(detail.body.status).toBe('INACTIVE');
  });

  it('UC-10.1/AC8 Đồng thời gửi 2 request tạo mới cùng UUID và payload qua HTTP', async () => {
    const id = 'c0000000-0000-4000-a000-000000000099';
    const payload = {
      id,
      name: 'Concurrent HTTP Create',
      discountType: 'PERCENTAGE',
      discountValue: '15',
    };

    const [res1, res2] = await Promise.all([adminPost(payload), adminPost(payload)]);

    expect([200, 201]).toContain(res1.status);
    expect([200, 201]).toContain(res2.status);
    expect(res1.body.id).toBe(id);
    expect(res2.body.id).toBe(id);

    const count = await t.prisma.promotion.count({ where: { id } });
    expect(count).toBe(1);
  });

  it('UC-10.1/AC9 Chặn thay đổi status hoặc xóa conditions trên chiến dịch có conditions phức tạp', async () => {
    const complex = await t.prisma.promotion.create({
      data: {
        name: 'Chiến dịch Complex Chặn Sửa',
        discountType: DiscountType.PERCENTAGE,
        discountValue: '20',
        conditions: { type: 'VIP', tiers: [1, 2] },
        status: PromotionStatus.ACTIVE,
      },
    });

    const detail = await adminGet(`/${complex.id}`).expect(200);

    // Chặn đổi status
    await adminPatch(complex.id, {
      status: 'INACTIVE',
      expectedUpdatedAt: detail.body.updatedAt,
    }).expect(400);

    // Chặn xóa conditions
    await adminPatch(complex.id, {
      conditions: null,
      expectedUpdatedAt: detail.body.updatedAt,
    }).expect(400);

    // Xác minh DB không bị đổi
    const row = await t.prisma.promotion.findUniqueOrThrow({ where: { id: complex.id } });
    expect(row.status).toBe(PromotionStatus.ACTIVE);
    expect(row.conditions).toEqual({ type: 'VIP', tiers: [1, 2] });
  });
});
