import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MediaCleanupService } from '../src/modules/uploads/media-cleanup.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';
import {
  type Actor,
  type ReviewWorld,
  setupReviewWorld,
  uploadPhoto,
} from './helpers/review-flow.js';

const DAY_MS = 86_400_000;

describe('UC-11.1 viet va sua danh gia san pham (PostgreSQL)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let w: ReviewWorld;
  const post = (actor: Actor, body: Record<string, unknown>) =>
    t.http.post('/api/reviews').set(actor.auth).send(body);
  const eligible = async (actor: Actor) =>
    (await t.http.get('/api/reviews/eligible').set(actor.auth).expect(200)).body as {
      orderItemId: string;
    }[];
  const product = async () => (await t.http.get(`/api/products/${w.productSlug}`).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp({ imageStorage: storage });
  });
  beforeEach(async () => {
    storage.reset();
    w = await setupReviewWorld(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-11.1/AC1 chi dong don da giao moi danh gia duoc; danh sach cho danh gia kem han 30 ngay', async () => {
    const { orderId, orderItemId } = await w.placeOrder();
    expect(await eligible(w.buyer)).toEqual([]);
    const early = await post(w.buyer, { orderItemId, rating: 5 }).expect(422);
    expect(early.body.code).toBe('REVIEW_NOT_ALLOWED');

    await w.markDelivered(orderId);
    const response = await t.http.get('/api/reviews/eligible').set(w.buyer.auth).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toHaveLength(1);
    const [item] = response.body;
    expect(item).toMatchObject({ orderItemId, orderId, product: { slug: w.productSlug } });
    expect(Date.parse(item.reviewDeadline) - Date.parse(item.deliveredAt)).toBe(30 * DAY_MS);
    await t.http.get('/api/reviews/eligible').expect(401);
  });

  it('UC-11.1/AC2 chu sach khong anh: hien ngay, cap nhat diem san pham; moi dong don mot danh gia', async () => {
    const { orderItemId } = await w.deliveredItem();
    const created = await post(w.buyer, {
      orderItemId,
      rating: 4,
      content: '  Vải mát, mặc vừa người.  ',
      fitFeedback: 'TRUE_TO_SIZE',
      heightCm: 160,
      weightKg: 50,
    }).expect(201);
    expect(created.body).toMatchObject({
      status: 'APPROVED',
      rating: 4,
      content: 'Vải mát, mặc vừa người.',
      fitFeedback: 'TRUE_TO_SIZE',
      heightCm: 160,
      weightKg: 50,
      reviewerName: 'Minh Anh',
      canEdit: true,
      moderationNote: null,
    });
    expect(await product()).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
    expect(await eligible(w.buyer)).toEqual([]);

    const again = await post(w.buyer, { orderItemId, rating: 5 }).expect(409);
    expect(again.body.code).toBe('REVIEW_ALREADY_EXISTS');
    expect(await t.prisma.review.count()).toBe(1);
  });

  it('UC-11.1/AC1 hoan tien sau giao: PARTIALLY_REFUNDED van viet duoc; REFUNDED, PAYMENT_REVIEW thi 422 (E2)', async () => {
    // Dat thang trang thai hien tai cua don: luat xet trang thai hien tai cung lan giao (BR1).
    const setStatus = (
      orderId: string,
      status: 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'PAYMENT_REVIEW',
    ) => t.prisma.order.update({ where: { id: orderId }, data: { status } });
    const partial = await w.deliveredItem();
    const refunded = await w.deliveredItem();
    const inReview = await w.deliveredItem();
    await setStatus(partial.orderId, 'PARTIALLY_REFUNDED');
    await setStatus(refunded.orderId, 'REFUNDED');
    await setStatus(inReview.orderId, 'PAYMENT_REVIEW');

    expect((await eligible(w.buyer)).map((item) => item.orderItemId)).toEqual([
      partial.orderItemId,
    ]);
    for (const blocked of [refunded, inReview]) {
      const response = await post(w.buyer, { orderItemId: blocked.orderItemId, rating: 5 }).expect(
        422,
      );
      expect(response.body.code).toBe('REVIEW_NOT_ALLOWED');
    }
    await post(w.buyer, { orderItemId: partial.orderItemId, rating: 4 }).expect(201);
  });

  it('UC-11.1/AC2 gui hai lan cung luc cung mot dong don: mot 201, mot 409, chi mot danh gia', async () => {
    const { orderItemId } = await w.deliveredItem();
    const responses = await Promise.all([
      post(w.buyer, { orderItemId, rating: 5 }),
      post(w.buyer, { orderItemId, rating: 4 }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe(
      'REVIEW_ALREADY_EXISTS',
    );
    expect(await t.prisma.review.count()).toBe(1);
  });

  it('UC-11.1/AC2 danh gia da xoa mem van giu cho dong don: khong vao lai danh sach cho, viet lai 409', async () => {
    const { orderItemId } = await w.deliveredItem();
    const created = await post(w.buyer, { orderItemId, rating: 5 }).expect(201);
    await t.prisma.review.update({
      where: { id: created.body.id },
      data: { deletedAt: new Date() },
    });
    expect(await eligible(w.buyer)).toEqual([]);
    const again = await post(w.buyer, { orderItemId, rating: 4 }).expect(409);
    expect(again.body.code).toBe('REVIEW_ALREADY_EXISTS');
  });

  it('UC-11.1/AC3 dong don cua nguoi khac: 404, khong lo dong don do co ton tai', async () => {
    const { orderItemId } = await w.deliveredItem();
    const response = await post(w.other, { orderItemId, rating: 5 }).expect(404);
    expect(response.body.code).toBe('ORDER_ITEM_NOT_FOUND');
  });

  it('UC-11.1/AC4 qua 30 ngay ke tu luc giao: het han, khong con trong danh sach cho', async () => {
    const { orderId, orderItemId } = await w.deliveredItem();
    await t.prisma.orderStatusHistory.updateMany({
      where: { orderId, status: 'DELIVERED' },
      data: { createdAt: new Date(Date.now() - 31 * DAY_MS) },
    });
    expect(await eligible(w.buyer)).toEqual([]);
    const late = await post(w.buyer, { orderItemId, rating: 5 }).expect(422);
    expect(late.body.code).toBe('REVIEW_WINDOW_CLOSED');
  });

  it('UC-11.1/AC5 anh: chi anh trong thu muc cua minh, da tai xong, dung dinh dang; co anh thi cho duyet', async () => {
    const { orderItemId } = await w.deliveredItem();
    const ticket = await t.http
      .post('/api/uploads/tickets')
      .set(w.buyer.auth)
      .send({ purpose: 'review' })
      .expect(200);
    expect(ticket.body).toMatchObject({
      maxBytes: 5 * 1024 * 1024,
      formats: ['jpg', 'png', 'webp'],
    });
    expect(ticket.body.key).toBe(`freya/reviews/${w.buyer.id}/img1`);
    expect(
      await t.prisma.mediaUpload.findUnique({ where: { storageKey: ticket.body.key } }),
    ).toMatchObject({ ownerId: w.buyer.id, status: 'PENDING' });
    const prefix = `freya/reviews/${w.buyer.id}/`;

    const foreign = `freya/reviews/${w.other.id}/stolen`;
    storage.put(foreign);
    const stolen = await post(w.buyer, { orderItemId, rating: 5, media: [{ key: foreign }] });
    expect([stolen.status, stolen.body.code]).toEqual([422, 'INVALID_MEDIA']);
    const missing = await post(w.buyer, {
      orderItemId,
      rating: 5,
      media: [{ key: `${prefix}missing` }],
    });
    expect([missing.status, missing.body.code]).toEqual([422, 'INVALID_MEDIA']);
    // Anh sai dinh dang vao hang xoa (ADR-056): khong goi kho ngay, luot don sau xoa theo lo.
    const anim = await uploadPhoto(t, storage, w.buyer, { format: 'gif' });
    const gif = await post(w.buyer, { orderItemId, rating: 5, media: [{ key: anim }] });
    expect([gif.status, gif.body.code]).toEqual([422, 'INVALID_MEDIA']);
    expect(storage.removed).toEqual([]);
    expect(await t.prisma.mediaUpload.findUnique({ where: { storageKey: anim } })).toMatchObject({
      status: 'DISCARDED',
    });
    await t.app.get(MediaCleanupService).sweep();
    expect(storage.removed).toEqual([anim]);

    const photo = await uploadPhoto(t, storage, w.buyer);
    const created = await post(w.buyer, {
      orderItemId,
      rating: 5,
      content: 'Đẹp như hình',
      media: [{ key: photo }],
    }).expect(201);
    expect(created.body).toMatchObject({
      status: 'PENDING',
      media: [
        {
          url: `https://cdn.test/${photo}.jpg`,
          thumbnailUrl: `https://cdn.test/thumb/${photo}.jpg`,
        },
      ],
    });
    // Gan xong thi dong cho trong so bien mat: worker khong bao gio xoa anh da gan.
    expect(await t.prisma.mediaUpload.count({ where: { storageKey: photo } })).toBe(0);
    const list = await t.http.get(`/api/products/${w.productSlug}/reviews`).expect(200);
    expect(list.body.total).toBe(0);
    expect((await product()).ratingCount).toBe(0);
  });

  it('UC-11.1/AC5 kho anh loi khi kiem: 503 UPLOADS_UNAVAILABLE, khong tao danh gia', async () => {
    const { orderItemId } = await w.deliveredItem();
    const key = `freya/reviews/${w.buyer.id}/photo`;
    storage.put(key);
    storage.failInspect = true;
    const response = await post(w.buyer, { orderItemId, rating: 5, media: [{ key }] }).expect(503);
    expect(response.body.code).toBe('UPLOADS_UNAVAILABLE');
    expect(await t.prisma.review.count()).toBe(0);
  });

  it('UC-11.1/AC6 chu co so dien thoai, link hay tu tuc: cho duyet thay vi hien ngay', async () => {
    const contents = [
      'Inbox Zalo 0901 234 567 để mua rẻ hơn',
      'Xem thêm tại https://shop-khac.vn nhé',
      'Hàng như đéo gì vậy',
    ];
    for (const content of contents) {
      const { orderItemId } = await w.deliveredItem();
      const created = await post(w.buyer, { orderItemId, rating: 1, content }).expect(201);
      expect(created.body.status).toBe('PENDING');
    }
    expect((await product()).ratingCount).toBe(0);
  });

  it('UC-11.1/AC7 sua mot lan trong han: duyet lai, thay anh thi anh cu vao hang xoa; lan hai bi chan', async () => {
    const original = await uploadPhoto(t, storage, w.buyer);
    const replacement = await uploadPhoto(t, storage, w.buyer);
    const { orderItemId } = await w.deliveredItem();
    const created = (
      await post(w.buyer, {
        orderItemId,
        rating: 3,
        content: 'Tạm được',
        media: [{ key: original }],
      }).expect(201)
    ).body;

    await t.http
      .patch(`/api/reviews/${created.id}`)
      .set(w.other.auth)
      .send({ rating: 1 })
      .expect(404);
    const edited = await t.http
      .patch(`/api/reviews/${created.id}`)
      .set(w.buyer.auth)
      .send({ rating: 5, content: null, media: [{ key: replacement }] })
      .expect(200);
    expect(edited.body).toMatchObject({
      rating: 5,
      content: null,
      status: 'PENDING',
      canEdit: false,
      media: [{ url: `https://cdn.test/${replacement}.jpg` }],
    });
    expect(edited.body.editedAt).not.toBeNull();
    // Anh bi thay vao hang xoa cung giao dich sua; anh moi da gan nen khong con dong cho.
    expect(storage.removed).toEqual([]);
    expect(
      await t.prisma.mediaUpload.findMany({ select: { storageKey: true, status: true } }),
    ).toEqual([{ storageKey: original, status: 'DISCARDED' }]);
    await t.app.get(MediaCleanupService).sweep();
    expect(storage.removed).toEqual([original]);

    const second = await t.http
      .patch(`/api/reviews/${created.id}`)
      .set(w.buyer.auth)
      .send({ rating: 4 })
      .expect(422);
    expect(second.body.code).toBe('REVIEW_NOT_EDITABLE');
  });

  it('UC-11.1/AC7 sua danh gia dang hien (chu sach): diem san pham tinh lai ngay', async () => {
    const review = await w.review({ rating: 2, content: 'Hơi rộng' });
    expect(review.status).toBe('APPROVED');
    expect((await product()).ratingAverage).toBe(2);
    const edited = await t.http
      .patch(`/api/reviews/${review.id}`)
      .set(w.buyer.auth)
      .send({ rating: 5, fitFeedback: 'TOO_LARGE' })
      .expect(200);
    expect(edited.body).toMatchObject({ status: 'APPROVED', rating: 5, fitFeedback: 'TOO_LARGE' });
    expect(await product()).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
  });

  it('UC-11.1/AC8 an danh che ten; trang cong khai khong bao gio co email hay userId', async () => {
    const anonymous = await w.review({ rating: 5, content: 'Ổn', isAnonymous: true });
    const mine = await t.http.get('/api/reviews/mine').set(w.buyer.auth).expect(200);
    expect(mine.headers['cache-control']).toBe('no-store');
    expect(mine.body.items[0]).toMatchObject({
      id: anonymous.id,
      isAnonymous: true,
      reviewerName: 'N*****h',
    });

    const list = await t.http.get(`/api/products/${w.productSlug}/reviews`).expect(200);
    expect(list.body.items[0].reviewerName).toBe('N*****h');
    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain(w.buyer.email);
    expect(raw).not.toContain(w.buyer.id);
  });

  it('UC-11.1/AC9 du lieu vao sai: 400, ke ca truong la', async () => {
    const { orderItemId } = await w.deliveredItem();
    const cases: Record<string, unknown>[] = [
      { orderItemId, rating: 0 },
      { orderItemId, rating: '5' },
      { orderItemId, rating: 6 },
      { orderItemId, rating: 4.5 },
      { orderItemId, rating: 5, content: 'x'.repeat(1501) },
      { orderItemId, rating: 5, heightCm: 99 },
      { orderItemId, rating: 5, fitFeedback: 'PERFECT' },
      { orderItemId, rating: 5, media: [{ key: '../etc/passwd' }] },
      { orderItemId, rating: 5, media: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}` })) },
      { orderItemId, rating: 5, productId: orderItemId },
      { orderItemId, rating: 5, userId: w.other.id },
      { orderItemId, rating: 5, moderationStatus: 'APPROVED' },
      { orderItemId: 'not-a-uuid', rating: 5 },
    ];
    for (const body of cases) {
      const response = await post(w.buyer, body);
      expect([JSON.stringify(body).slice(0, 60), response.status]).toEqual([
        JSON.stringify(body).slice(0, 60),
        400,
      ]);
    }
    await t.http.post('/api/reviews').send({ orderItemId, rating: 5 }).expect(401);
  });
});
