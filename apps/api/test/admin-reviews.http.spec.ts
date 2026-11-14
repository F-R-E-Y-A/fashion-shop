import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';
import { type ReviewWorld, setupReviewWorld, uploadPhoto } from './helpers/review-flow.js';

describe('UC-11.2 duyet va phan hoi danh gia (PostgreSQL)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let w: ReviewWorld;
  const admin = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    t.http[method](`/api/admin/reviews${path}`).set(w.admin.auth);
  const audits = (entityId: string) =>
    t.prisma.auditLog.findMany({
      where: { entityType: 'REVIEW', entityId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorUserId: true, metadata: true },
    });
  const productRating = async () =>
    (await t.http.get(`/api/products/${w.productSlug}`).expect(200)).body as {
      ratingAverage: number;
      ratingCount: number;
    };
  const pendingWithPhoto = async (name: string, rating = 5) => {
    const key = await uploadPhoto(t, storage, w.buyer);
    return w.review({ rating, content: name, media: [{ key }] });
  };

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

  it('UC-11.2/AC1 chi ADMIN; moi phan hoi deu no-store', async () => {
    await t.http.get('/api/admin/reviews').expect(401);
    await t.http.get('/api/admin/reviews').set(w.buyer.auth).expect(403);
    const response = await admin('get', '').expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('UC-11.2/AC2 hang cho duyet cu nhat truoc; duyet thi hien, tinh diem, ghi nhat ky mot lan', async () => {
    const first = await pendingWithPhoto('dau', 4);
    const second = await pendingWithPhoto('sau', 2);
    const queue = await admin('get', '?status=PENDING').expect(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).toEqual([first.id, second.id]);
    expect(queue.body.items[0]).toMatchObject({
      reviewer: { id: w.buyer.id, email: w.buyer.email, displayName: 'Minh Anh' },
      product: { slug: w.productSlug },
      status: 'PENDING',
      reportCount: 0,
    });
    expect(queue.body.items[0].orderCode).toEqual(expect.any(String));

    expect(queue.body.items[0].editCount).toBe(0);
    await admin('post', `/${first.id}/approve`).expect(400);
    const approved = await admin('post', `/${first.id}/approve`).send({ editCount: 0 }).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', moderationNote: null });
    expect(approved.body.moderatedAt).not.toBeNull();
    expect(await productRating()).toMatchObject({ ratingAverage: 4, ratingCount: 1 });
    await admin('post', `/${first.id}/approve`).send({ editCount: 0 }).expect(200);
    expect(await audits(first.id)).toEqual([
      {
        action: 'REVIEW_APPROVED',
        actorUserId: w.admin.id,
        metadata: { fromStatus: 'PENDING', toStatus: 'APPROVED' },
      },
    ]);
    await admin('post', '/00000000-0000-4000-8000-000000000000/approve')
      .send({ editCount: 0 })
      .expect(404);
    await admin('post', '/not-a-uuid/approve').send({ editCount: 0 }).expect(400);
  });

  it('UC-11.2/AC3 an kem ly do: bot diem, nguoi viet thay ly do va khong sua duoc nua', async () => {
    const review = await w.review({ rating: 5, content: 'Tuyệt' });
    expect(await productRating()).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
    await admin('post', `/${review.id}/reject`).send({}).expect(400);
    await admin('post', `/${review.id}/reject`).send({ note: '   ', editCount: 0 }).expect(400);
    await admin('post', `/${review.id}/reject`).send({ note: 'Thiếu phiên bản' }).expect(400);
    const rejected = await admin('post', `/${review.id}/reject`)
      .send({ note: 'Nội dung không liên quan sản phẩm', editCount: 0 })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      moderationNote: 'Nội dung không liên quan sản phẩm',
    });
    expect(await productRating()).toMatchObject({ ratingAverage: 0, ratingCount: 0 });
    expect(
      (await t.http.get(`/api/products/${w.productSlug}/reviews`).expect(200)).body.total,
    ).toBe(0);

    const mine = await t.http.get('/api/reviews/mine').set(w.buyer.auth).expect(200);
    expect(mine.body.items[0]).toMatchObject({
      status: 'REJECTED',
      moderationNote: 'Nội dung không liên quan sản phẩm',
      canEdit: false,
    });
    const edit = await t.http
      .patch(`/api/reviews/${review.id}`)
      .set(w.buyer.auth)
      .send({ content: 'Sửa lại' })
      .expect(422);
    expect(edit.body.code).toBe('REVIEW_NOT_EDITABLE');
    const again = await admin('post', `/${review.id}/reject`)
      .send({ note: 'Lần hai', editCount: 0 })
      .expect(409);
    expect(again.body.code).toBe('REVIEW_ALREADY_REJECTED');
    expect((await audits(review.id)).map((row) => row.action)).toEqual(['REVIEW_REJECTED']);
  });

  it('UC-11.2/AC7 khach sua sau khi quan tri tai trang: duyet hay an ban cu bi 409, khong doi gi', async () => {
    const review = await pendingWithPhoto('ban-cu', 5);
    const seen = (await admin('get', '?status=PENDING').expect(200)).body.items[0];
    expect(seen).toMatchObject({ id: review.id, editCount: 0, content: 'ban-cu' });

    // Giu anh (khong gui media): van co anh nen van cho duyet, phien ban tang len 1.
    await t.http
      .patch(`/api/reviews/${review.id}`)
      .set(w.buyer.auth)
      .send({ content: 'Liên hệ zalo 0901234567 giá sỉ' })
      .expect(200);
    const stale = await admin('post', `/${review.id}/approve`).send({ editCount: 0 }).expect(409);
    expect(stale.body.code).toBe('REVIEW_CHANGED');
    await admin('post', `/${review.id}/reject`)
      .send({ note: 'Theo bản cũ', editCount: 0 })
      .expect(409);
    expect(await audits(review.id)).toEqual([]);
    expect(await productRating()).toMatchObject({ ratingAverage: 0, ratingCount: 0 });

    const fresh = (await admin('get', '?status=PENDING').expect(200)).body.items[0];
    expect(fresh).toMatchObject({ editCount: 1, content: 'Liên hệ zalo 0901234567 giá sỉ' });
    await admin('post', `/${review.id}/reject`)
      .send({ note: 'Có số điện thoại', editCount: 1 })
      .expect(200);
  });

  it('UC-11.2/AC4 phan hoi cua shop hien tren trang cong khai; sua va go duoc', async () => {
    const review = await w.review({ rating: 3, content: 'Giao chậm' });
    await admin('put', `/${review.id}/reply`).send({ content: '' }).expect(400);
    await admin('put', `/${review.id}/reply`)
      .send({ content: 'Shop xin lỗi vì giao chậm.' })
      .expect(200);
    await admin('put', `/${review.id}/reply`)
      .send({ content: 'Shop xin lỗi, đã tặng mã giảm giá.' })
      .expect(200);
    const list = await t.http.get(`/api/products/${w.productSlug}/reviews`).expect(200);
    expect(list.body.items[0].reply).toMatchObject({
      content: 'Shop xin lỗi, đã tặng mã giảm giá.',
    });

    const removed = await admin('delete', `/${review.id}/reply`).expect(200);
    expect(removed.body.reply).toBeNull();
    await admin('delete', `/${review.id}/reply`).expect(200);
    expect(await audits(review.id)).toEqual([
      expect.objectContaining({ action: 'REVIEW_REPLIED', metadata: { edited: false } }),
      expect.objectContaining({ action: 'REVIEW_REPLIED', metadata: { edited: true } }),
      expect.objectContaining({ action: 'REVIEW_REPLY_REMOVED', metadata: {} }),
    ]);
  });

  it('UC-11.2/AC5 hang bi bao cao va xoa bao cao sai', async () => {
    const review = await w.review({ rating: 1, content: 'Không như hình' });
    await t.http
      .post(`/api/reviews/${review.id}/report`)
      .set(w.other.auth)
      .send({ reason: 'IRRELEVANT', note: 'Spam' })
      .expect(204);
    const reported = await admin('get', '?reported=true').expect(200);
    expect(reported.body.items).toHaveLength(1);
    expect(reported.body.items[0]).toMatchObject({
      id: review.id,
      reportCount: 1,
      reports: [{ reason: 'IRRELEVANT', note: 'Spam' }],
    });

    const cleared = await admin('post', `/${review.id}/clear-reports`).expect(200);
    expect(cleared.body).toMatchObject({ reportCount: 0, reports: [] });
    expect((await admin('get', '?reported=true').expect(200)).body.items).toEqual([]);
    expect(await audits(review.id)).toEqual([
      expect.objectContaining({ action: 'REVIEW_REPORTS_CLEARED', metadata: { cleared: 1 } }),
    ]);
  });

  it('UC-11.2/AC6 loc theo so sao, tim theo chu, email nguoi viet, ten san pham', async () => {
    const low = await w.review({ rating: 1, content: 'Đường may lỗi 50%_' });
    await w.review({ rating: 5, content: 'Hoàn hảo' });
    const ids = async (query: string) =>
      ((await admin('get', `?${query}`).expect(200)).body.items as { id: string }[]).map(
        (item) => item.id,
      );
    expect(await ids('rating=1')).toEqual([low.id]);
    expect(await ids(`q=${encodeURIComponent('50%_')}`)).toEqual([low.id]);
    expect(await ids('q=%25')).toEqual([low.id]);
    expect(await ids('q=BUYER%40FIXTURE')).toHaveLength(2);
    expect(await ids('q=khong-co-dau-ca')).toEqual([]);
    await admin('get', '?status=HIDDEN').expect(400);
  });
});
