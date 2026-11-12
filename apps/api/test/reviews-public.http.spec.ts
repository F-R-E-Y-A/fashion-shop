import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';
import { type ReviewWorld, setupReviewWorld, uploadPhoto } from './helpers/review-flow.js';

describe('UC-11.3 xem, binh chon va bao cao danh gia (PostgreSQL)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let w: ReviewWorld;
  const reviewsUrl = () => `/api/products/${w.productSlug}/reviews`;
  const approve = (id: string) =>
    t.http
      .post(`/api/admin/reviews/${id}/approve`)
      .set(w.admin.auth)
      .send({ editCount: 0 })
      .expect(200);

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

  it('UC-11.3/AC1 tong hop: trung binh, phan bo 5 muc, co anh/co chu, do vua; khop diem tren san pham', async () => {
    const photo = await uploadPhoto(t, storage, w.buyer);
    const five = await w.review({ rating: 5, content: 'Rất đẹp', fitFeedback: 'TRUE_TO_SIZE' });
    const four = await w.review({ rating: 4, fitFeedback: 'TOO_SMALL' });
    const one = await w.review({ rating: 1, content: 'Phai màu', media: [{ key: photo }] });
    expect(one.status).toBe('PENDING');
    await approve(one.id);

    const summary = await t.http.get(`${reviewsUrl()}/summary`).expect(200);
    expect(summary.body).toEqual({
      average: 3.33,
      count: 3,
      distribution: [
        { rating: 5, count: 1 },
        { rating: 4, count: 1 },
        { rating: 3, count: 0 },
        { rating: 2, count: 0 },
        { rating: 1, count: 1 },
      ],
      withMediaCount: 1,
      withContentCount: 2,
      fit: { tooSmall: 1, trueToSize: 1, tooLarge: 0, total: 2 },
    });
    const product = await t.http.get(`/api/products/${w.productSlug}`).expect(200);
    expect(product.body).toMatchObject({ ratingAverage: 3.33, ratingCount: 3 });
    // Danh sach doc catalog trong bo nho: diem moi phai toi duoc sau khi catalog_revision tang.
    const listed = await t.http.get('/api/products?pageSize=60').expect(200);
    expect(
      listed.body.items.find((item: { slug: string }) => item.slug === w.productSlug),
    ).toMatchObject({ ratingAverage: 3.33, ratingCount: 3 });

    const ids = async (query: string) =>
      (
        (await t.http.get(`${reviewsUrl()}?${query}`).expect(200)).body.items as { id: string }[]
      ).map((item) => item.id);
    expect(await ids('rating=5')).toEqual([five.id]);
    expect(await ids('withMedia=true')).toEqual([one.id]);
    expect(await ids('withContent=false')).toEqual([four.id]);
    expect(await ids('sort=rating_asc')).toEqual([one.id, four.id, five.id]);
    expect(await ids('sort=newest&pageSize=2')).toEqual([one.id, four.id]);
    await t.http.get(`${reviewsUrl()}?withMedia=yes`).expect(400);
    await t.http.get(`${reviewsUrl()}?sort=random`).expect(400);
  });

  it('UC-11.3/AC2 huu ich: moi nguoi mot phieu, khong tu bam cho minh, bo phieu duoc', async () => {
    const review = await w.review({ rating: 5, content: 'Đẹp' });
    const vote = (actor = w.other) =>
      t.http.post(`/api/reviews/${review.id}/helpful`).set(actor.auth);
    const own = await vote(w.buyer).expect(422);
    expect(own.body.code).toBe('OWN_REVIEW');
    expect((await vote().expect(200)).body).toEqual({ helpfulCount: 1, voted: true });
    expect((await vote().expect(200)).body).toEqual({ helpfulCount: 1, voted: true });

    const asOther = await t.http.get(reviewsUrl()).set(w.other.auth).expect(200);
    expect(asOther.body.items[0]).toMatchObject({
      helpfulCount: 1,
      viewerHasVoted: true,
      isOwn: false,
    });
    const asGuest = await t.http.get(reviewsUrl()).expect(200);
    expect(asGuest.body.items[0]).toMatchObject({ viewerHasVoted: false, isOwn: false });
    const asAuthor = await t.http.get(reviewsUrl()).set(w.buyer.auth).expect(200);
    expect(asAuthor.body.items[0].isOwn).toBe(true);
    await t.http.get(reviewsUrl()).set({ Authorization: 'Bearer sai' }).expect(401);

    const unvote = () => t.http.delete(`/api/reviews/${review.id}/helpful`).set(w.other.auth);
    expect((await unvote().expect(200)).body).toEqual({ helpfulCount: 0, voted: false });
    expect((await unvote().expect(200)).body).toEqual({ helpfulCount: 0, voted: false });
  });

  it('UC-11.3/AC2 danh gia chua duyet: khong binh chon, khong bao cao duoc (404)', async () => {
    const photo = await uploadPhoto(t, storage, w.buyer);
    const pending = await w.review({ rating: 5, media: [{ key: photo }] });
    await t.http.post(`/api/reviews/${pending.id}/helpful`).set(w.other.auth).expect(404);
    await t.http
      .post(`/api/reviews/${pending.id}/report`)
      .set(w.other.auth)
      .send({ reason: 'SPAM' })
      .expect(404);
  });

  it('UC-11.3/AC3 bao cao: danh dau cho quan tri, khong tu an; bao lai khong tinh them', async () => {
    const review = await w.review({ rating: 1, content: 'Tệ' });
    const report = (body: Record<string, unknown>, actor = w.other) =>
      t.http.post(`/api/reviews/${review.id}/report`).set(actor.auth).send(body);
    await report({ reason: 'SPAM', note: '  quảng cáo  ' }).expect(204);
    await report({ reason: 'OFFENSIVE' }).expect(204);
    expect((await report({ reason: 'SPAM' }, w.buyer).expect(422)).body.code).toBe('OWN_REVIEW');
    await report({ reason: 'FAKE' }).expect(400);

    const stored = await t.prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect([stored.reportCount, stored.moderationStatus]).toEqual([1, 'APPROVED']);
    const rows = await t.prisma.reviewReport.findMany({ where: { reviewId: review.id } });
    expect(rows.map((row) => [row.reason, row.note])).toEqual([['SPAM', 'quảng cáo']]);
    expect((await t.http.get(reviewsUrl()).expect(200)).body.total).toBe(1);
  });

  it('UC-11.3/AC4 san pham an hoac slug sai: 404 va 400 nhu trang chi tiet', async () => {
    await t.http.get('/api/products/KHONG_HOP_LE/reviews').expect(400);
    await t.http.get('/api/products/khong-ton-tai/reviews/summary').expect(404);
    await t.prisma.product.update({ where: { id: w.productId }, data: { isActive: false } });
    await t.http.get(`${reviewsUrl()}/summary`).expect(404);
    await t.http.get(reviewsUrl()).expect(404);
  });

  it('UC-11.3/AC7 bien: chua co danh gia da duyet (chi co bai cho duyet, bai duy nhat vua an) thi moi so ve 0', async () => {
    const empty = {
      average: 0,
      count: 0,
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: 0 })),
      withMediaCount: 0,
      withContentCount: 0,
      fit: { tooSmall: 0, trueToSize: 0, tooLarge: 0, total: 0 },
    };
    const summary = async () => (await t.http.get(`${reviewsUrl()}/summary`).expect(200)).body;
    const fiveStar = async () => (await t.http.get(`${reviewsUrl()}?rating=5`).expect(200)).body;

    expect(await summary()).toEqual(empty);
    expect(await fiveStar()).toMatchObject({ items: [], total: 0 });

    // Bai cho duyet khong tinh vao tong hop, ke ca khi la bai duy nhat.
    const only = await w.review({ rating: 5, content: 'Inbox Zalo 0901 234 567 để mua rẻ hơn' });
    expect(only.status).toBe('PENDING');
    expect(await summary()).toEqual(empty);
    expect(await fiveStar()).toMatchObject({ items: [], total: 0 });

    await approve(only.id);
    expect(await summary()).toMatchObject({ average: 5, count: 1 });

    // An bai duy nhat: tu 1 ve 0 thi trung binh la 0, khong chia cho 0.
    await t.http
      .post(`/api/admin/reviews/${only.id}/reject`)
      .set(w.admin.auth)
      .send({ note: 'Có số điện thoại rao bán', editCount: 0 })
      .expect(200);
    expect(await summary()).toEqual(empty);
    expect(await fiveStar()).toMatchObject({ items: [], total: 0 });
    const product = await t.http.get(`/api/products/${w.productSlug}`).expect(200);
    expect(product.body).toMatchObject({ ratingAverage: 0, ratingCount: 0 });
  });

  it('UC-11.3/AC2 danh sach tra theo nguoi xem (isOwn, viewerHasVoted): Cache-Control no-store', async () => {
    await w.review({ rating: 5, content: 'Đẹp' });
    const guest = await t.http.get(reviewsUrl()).expect(200);
    const owner = await t.http.get(reviewsUrl()).set(w.buyer.auth).expect(200);
    expect(guest.headers['cache-control']).toBe('no-store');
    expect(owner.headers['cache-control']).toBe('no-store');
    expect(owner.body.items[0].isOwn).toBe(true);
    expect(guest.body.items[0].isOwn).toBe(false);
  });

  it('UC-11.3/AC7 bai da xoa mem khong hien o danh sach va tong hop', async () => {
    const kept = await w.review({ rating: 4, content: 'Giữ lại' });
    const gone = await w.review({ rating: 1, content: 'Bài sẽ bị xoá' });
    await t.prisma.review.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const list = await t.http.get(reviewsUrl()).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([kept.id]);
    expect(list.body.total).toBe(1);
    const summary = await t.http.get(`${reviewsUrl()}/summary`).expect(200);
    expect(summary.body).toMatchObject({ average: 4, count: 1 });
  });
});
