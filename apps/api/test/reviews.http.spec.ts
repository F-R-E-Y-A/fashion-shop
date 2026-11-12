import { randomBytes, randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

describe('Reviews HTTP API (Issue #96 - Customer Reviews & Public List)', () => {
  let t: TestApp;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;
  let variantId: string;
  let productId: string;
  let productSlug: string;

  const asA = () => ({ Authorization: `Bearer ${userAToken}` });
  const asB = () => ({ Authorization: `Bearer ${userBToken}` });

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();

    // 1. Tao User A va User B
    const userA = await t.prisma.user.create({
      data: {
        email: 'user.a@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    userAId = userA.id;
    userAToken = await t.app.get(JwtService).signAsync({ sub: userA.id, ver: userA.authVersion });

    const userB = await t.prisma.user.create({
      data: {
        email: 'user.b@example.test',
        status: 'ACTIVE',
        passwordHash: 'test-hash',
      },
    });
    userBId = userB.id;
    userBToken = await t.app.get(JwtService).signAsync({ sub: userB.id, ver: userB.authVersion });

    // 2. Lay san pham va bien the co san tu seed
    const variant = await t.prisma.productVariant.findFirstOrThrow({
      include: { product: true },
    });
    variantId = variant.id;
    productId = variant.productId;
    productSlug = variant.product.slug;
  });

  async function createOrder(userId: string, email: string, hasDelivered: boolean) {
    const statuses: Array<{ status: 'CONFIRMED' | 'PROCESSING' | 'DELIVERED' }> = [
      { status: 'CONFIRMED' },
    ];
    if (hasDelivered) {
      statuses.push({ status: 'PROCESSING' });
      statuses.push({ status: 'DELIVERED' });
    }

    return t.prisma.order.create({
      data: {
        userId,
        customerEmail: email,
        checkoutKey: randomUUID(),
        checkoutFingerprint: `fp-${randomUUID()}`,
        orderCode: `FR261112${randomBytes(4).toString('hex').toUpperCase()}`,
        status: hasDelivered ? 'DELIVERED' : 'CONFIRMED',
        paymentDueAt: new Date(Date.now() + 3600_000),
        shippingAddressSnapshot: { province: 'Hà Nội', recipientName: 'Khách hàng A' },
        subtotalAmount: '299000',
        discountAmount: '0',
        shippingFeeAmount: '30000',
        totalAmount: '329000',
        items: {
          create: [
            {
              productVariantId: variantId,
              quantity: 1,
              unitPrice: '299000',
              productSnapshot: { name: 'Áo mẫu', productSlug },
            },
          ],
        },
        statusHistory: {
          create: statuses,
        },
      },
      include: { items: true },
    });
  }

  describe('1. Quyền truy cập và chống IDOR', () => {
    it('từ chối khách vãng lai (chưa đăng nhập) bằng 401', async () => {
      await t.http.get(`/api/orders/${randomUUID()}/reviews`).expect(401);
      await t.http.post('/api/reviews').send({ orderItemId: randomUUID(), rating: 5 }).expect(401);
    });

    it('từ chối xem context đơn hàng của người khác bằng 404 (chống IDOR)', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const orderB = await createOrder(userBId, 'user.b@example.test', true);

      // User A cố tình đọc context đơn của User B
      const resA = await t.http.get(`/api/orders/${orderB.id}/reviews`).set(asA()).expect(404);
      expect(resA.body.message).toContain('Không tìm thấy đơn hàng');

      // User B cố tình đọc context đơn của User A
      const resB = await t.http.get(`/api/orders/${orderA.id}/reviews`).set(asB()).expect(404);
      expect(resB.body.message).toContain('Không tìm thấy đơn hàng');
    });

    it('từ chối đánh giá dòng hàng của người khác bằng 404 (chống IDOR)', async () => {
      const orderB = await createOrder(userBId, 'user.b@example.test', true);
      const orderItemIdB = orderB.items[0].id;

      // User A cố tình gửi review cho orderItem của User B
      const res = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: orderItemIdB, rating: 5, content: 'Đánh giá lậu' })
        .expect(404);
      expect(res.body.message).toContain('Không tìm thấy dòng hàng');
    });

    it('chặn các trường lạ hoặc can thiệp userId/productId/moderationStatus bằng 400', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      // Cố tình truyền moderationStatus hoặc userId trong body
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({
          orderItemId: itemId,
          rating: 5,
          moderationStatus: 'APPROVED',
          userId: userBId,
        })
        .expect(400);
    });
  });

  describe('2. Điều kiện giao hàng (DELIVERED eligibility)', () => {
    it('đơn chưa từng DELIVERED thì context trả eligible: false và lý do NOT_DELIVERED', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', false); // chưa giao

      const res = await t.http.get(`/api/orders/${orderA.id}/reviews`).set(asA()).expect(200);

      expect(res.body.orderId).toBe(orderA.id);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].eligible).toBe(false);
      expect(res.body.items[0].reasonCode).toBe('NOT_DELIVERED');
      expect(res.body.items[0].review).toBeNull();
    });

    it('cố tình gửi review cho đơn chưa từng DELIVERED bị chặn bằng 422', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', false); // chưa giao
      const itemId = orderA.items[0].id;

      const res = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 5, content: 'Chưa nhận mà đã đánh giá' })
        .expect(422);

      expect(res.body.message).toContain('chưa từng giao thành công');
    });

    it('đơn đã có lịch sử DELIVERED (dù sau đó PARTIALLY_REFUNDED) vẫn đủ điều kiện đánh giá', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      // Ghi thêm trạng thái hoàn tiền sau giao
      await t.prisma.orderStatusHistory.create({
        data: { orderId: orderA.id, status: 'PARTIALLY_REFUNDED' },
      });

      const res = await t.http.get(`/api/orders/${orderA.id}/reviews`).set(asA()).expect(200);

      expect(res.body.items[0].eligible).toBe(true);
      expect(res.body.items[0].reasonCode).toBeNull();
    });
  });

  describe('3. Tạo đánh giá, kiểm duyệt ban đầu và Idempotency', () => {
    it('gửi đánh giá thành công: trạng thái ban đầu là PENDING và lưu đúng DB', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      const res = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({
          orderItemId: itemId,
          rating: 5,
          content: '  Vải rất mát, form đẹp!  ',
        })
        .expect(201);

      expect(res.body.orderItemId).toBe(itemId);
      expect(res.body.productId).toBe(productId);
      expect(res.body.rating).toBe(5);
      expect(res.body.content).toBe('Vải rất mát, form đẹp!'); // đã trim
      expect(res.body.moderationStatus).toBe('PENDING');

      // Kiểm tra DB
      const dbRow = await t.prisma.review.findUniqueOrThrow({
        where: { orderItemId: itemId },
      });
      expect(dbRow.userId).toBe(userAId);
      expect(dbRow.moderationStatus).toBe('PENDING');
      expect(dbRow.content).toBe('Vải rất mát, form đẹp!');

      // Context đơn hàng sau khi đánh giá chuyển sang ALREADY_REVIEWED
      const contextRes = await t.http
        .get(`/api/orders/${orderA.id}/reviews`)
        .set(asA())
        .expect(200);
      expect(contextRes.body.items[0].eligible).toBe(false);
      expect(contextRes.body.items[0].reasonCode).toBe('ALREADY_REVIEWED');
      expect(contextRes.body.items[0].review?.id).toBe(dbRow.id);
    });

    it('gửi lại cùng orderItemId và cùng payload chuẩn hóa thì trả kết quả đã commit (idempotent)', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      // Lần 1
      const first = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 4, content: 'Được' })
        .expect(201);

      // Lần 2 (Replay)
      const second = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 4, content: '  Được  ' })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.rating).toBe(4);
    });

    it('gửi lại cùng orderItemId nhưng khác nội dung hoặc sao bị chặn bằng 409 Conflict', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      // Lần 1
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 4, content: 'Được' })
        .expect(201);

      // Lần 2 gửi rating khác
      const resDiffRating = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 5, content: 'Được' })
        .expect(409);
      expect(resDiffRating.body.message).toContain('đã được đánh giá');

      // Lần 2 gửi content khác
      const resDiffContent = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 4, content: 'Khác rồi' })
        .expect(409);
      expect(resDiffContent.body.message).toContain('đã được đánh giá');
    });

    it('đánh giá đã bị soft-deleted không được phép tạo lại và bị chặn bằng 409', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      await t.prisma.review.create({
        data: {
          userId: userAId,
          productId,
          orderItemId: itemId,
          rating: 5,
          content: 'Đã xóa',
          moderationStatus: 'REJECTED',
          deletedAt: new Date(),
        },
      });

      const res = await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 5, content: 'Đã xóa' })
        .expect(409);
      expect(res.body.message).toContain('đã bị xóa');
    });
  });

  describe('4. Validation đầu vào', () => {
    it('từ chối rating < 1 hoặc > 5 hoặc không phải số nguyên bằng 400', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 0 })
        .expect(400);
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 6 })
        .expect(400);
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 4.5 })
        .expect(400);
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: '5' })
        .expect(400);
    });

    it('từ chối content dài quá 2000 ký tự bằng 400', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      const longContent = 'A'.repeat(2001);
      await t.http
        .post('/api/reviews')
        .set(asA())
        .send({ orderItemId: itemId, rating: 5, content: longContent })
        .expect(400);
    });
  });

  describe('5. Public API: GET /api/products/:slug/reviews', () => {
    it('chỉ hiển thị các đánh giá APPROVED và chưa bị xóa, không lộ PII', async () => {
      const orderA = await createOrder(userAId, 'user.a@example.test', true);
      const itemId = orderA.items[0].id;

      // 1. Tạo 1 review PENDING của User A
      await t.prisma.review.create({
        data: {
          userId: userAId,
          productId,
          orderItemId: itemId,
          rating: 4,
          content: 'Đánh giá PENDING chưa được duyệt',
          moderationStatus: 'PENDING',
        },
      });

      // Public API không được hiển thị review PENDING
      const resPending = await t.http.get(`/api/products/${productSlug}/reviews`).expect(200);
      expect(resPending.body.total).toBe(0);
      expect(resPending.body.items).toHaveLength(0);

      // 2. Chuyển review sang APPROVED trong DB test
      await t.prisma.review.update({
        where: { orderItemId: itemId },
        data: { moderationStatus: 'APPROVED' },
      });

      const resApproved = await t.http.get(`/api/products/${productSlug}/reviews`).expect(200);

      expect(resApproved.body.total).toBe(1);
      expect(resApproved.body.items).toHaveLength(1);
      const publicItem = resApproved.body.items[0];

      // Allowlist kiểm tra: Chỉ có id, rating, content, createdAt
      expect(publicItem.rating).toBe(4);
      expect(publicItem.content).toBe('Đánh giá PENDING chưa được duyệt');
      expect(publicItem).toHaveProperty('id');
      expect(publicItem).toHaveProperty('createdAt');

      // TUYỆT ĐỐI không có PII hay metadata nội bộ
      expect(publicItem).not.toHaveProperty('userId');
      expect(publicItem).not.toHaveProperty('orderItemId');
      expect(publicItem).not.toHaveProperty('moderationStatus');
      expect(publicItem).not.toHaveProperty('reviewer');

      // 3. Nếu đánh giá bị soft-delete (deletedAt != null), public không còn hiển thị
      await t.prisma.review.update({
        where: { orderItemId: itemId },
        data: { deletedAt: new Date() },
      });

      const resDeleted = await t.http.get(`/api/products/${productSlug}/reviews`).expect(200);
      expect(resDeleted.body.total).toBe(0);
      expect(resDeleted.body.items).toHaveLength(0);
    });

    it('trả về 404 khi sản phẩm bị ẩn hoặc không tồn tại', async () => {
      await t.http.get('/api/products/san-pham-khong-ton-tai/reviews').expect(404);
    });

    it('có header Cache-Control: no-store', async () => {
      const res = await t.http.get(`/api/products/${productSlug}/reviews`).expect(200);
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });
});
