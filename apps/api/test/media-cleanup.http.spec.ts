import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLAIM_LEASE_MS,
  MediaCleanupService,
  PENDING_GRACE_MS,
} from '../src/modules/uploads/media-cleanup.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { FakeImageStorage } from './helpers/fake-image-storage.js';
import { type ReviewWorld, setupReviewWorld, uploadPhoto } from './helpers/review-flow.js';

const HOUR_MS = 3_600_000;

describe('ADR-056 don anh mo coi theo lo (PostgreSQL)', () => {
  const storage = new FakeImageStorage();
  let t: TestApp;
  let w: ReviewWorld;
  let cleanup: MediaCleanupService;
  const prefix = () => `freya/reviews/${w.buyer.id}/`;
  /** Dong cho trong so voi thoi diem tai len tuy chon, khong can anh tren kho gia. */
  const ledger = (names: string[], createdAt: Date, status: 'PENDING' | 'DISCARDED' = 'PENDING') =>
    t.prisma.mediaUpload.createMany({
      data: names.map((name) => ({
        storageKey: `${prefix()}${name}`,
        ownerId: w.buyer.id,
        status,
        createdAt,
      })),
    });
  const range = (count: number, name: string) =>
    Array.from({ length: count }, (_, index) => `${name}${index}`);

  beforeAll(async () => {
    t = await createTestApp({ imageStorage: storage });
    cleanup = t.app.get(MediaCleanupService);
  });
  beforeEach(async () => {
    storage.reset();
    w = await setupReviewWorld(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it('UC-11.1/AC11 anh qua 24 gio chua gan bi xoa theo lo toi da 100; anh moi, anh da gan, anh 23 gio 59 phut giu nguyen', async () => {
    const now = new Date();
    const kept = await uploadPhoto(t, storage, w.buyer);
    const attached = await uploadPhoto(t, storage, w.buyer);
    const { orderItemId } = await w.deliveredItem();
    await t.http
      .post('/api/reviews')
      .set(w.buyer.auth)
      .send({ orderItemId, rating: 5, media: [{ key: attached }] })
      .expect(201);
    await ledger(range(230, 'stale'), new Date(now.getTime() - PENDING_GRACE_MS - HOUR_MS));
    await ledger(['edge'], new Date(now.getTime() - PENDING_GRACE_MS + 60_000));
    await ledger(['dropped'], now, 'DISCARDED');

    expect(await cleanup.sweep(now)).toEqual({ removed: 231, failed: 0 });
    // 231 anh = 3 lenh xoa; moi lenh mot lo, khong lenh nao qua 100 khoa.
    expect(storage.removeCalls.map((keys) => keys.length)).toEqual([100, 100, 31]);
    expect(new Set(storage.removed).size).toBe(231);
    expect(storage.removed).toContain(`${prefix()}dropped`);
    for (const key of [kept, attached, `${prefix()}edge`])
      expect(storage.removed).not.toContain(key);
    expect(storage.images.has(attached)).toBe(true);
    const left = await t.prisma.mediaUpload.findMany({
      orderBy: { storageKey: 'asc' },
      select: { storageKey: true, status: true },
    });
    expect(left).toEqual(
      [kept, `${prefix()}edge`].sort().map((storageKey) => ({ storageKey, status: 'PENDING' })),
    );

    expect(await cleanup.sweep(now)).toEqual({ removed: 0, failed: 0 });
    expect(storage.removeCalls).toHaveLength(3);
  });

  it('UC-11.1/AC11 hai luot don chong nhau nhan lo rieng, khong xoa trung', async () => {
    const now = new Date();
    await ledger(range(150, 'old'), new Date(now.getTime() - PENDING_GRACE_MS - HOUR_MS));
    const release = storage.holdRemove();
    const first = cleanup.sweep(now);
    const second = cleanup.sweep(now);
    // Ca hai luot da nhan lo va dang cho kho: lo cua luot nay DELETING nen luot kia khong nhan lai.
    await vi.waitFor(() => expect(storage.removeCalls).toHaveLength(2));
    release();
    const results = await Promise.all([first, second]);

    expect(results.map((result) => result.removed).sort((a, b) => a - b)).toEqual([50, 100]);
    expect(storage.removeCalls.map((keys) => keys.length).sort((a, b) => a - b)).toEqual([50, 100]);
    expect(new Set(storage.removed).size).toBe(150);
    expect(storage.removed).toHaveLength(150);
    expect(await t.prisma.mediaUpload.count()).toBe(0);
  });

  it('UC-11.1/AC11 kho loi khi xoa: giu lo, het han thue moi thu lai, roi xoa xong', async () => {
    const now = new Date();
    await ledger(range(3, 'retry'), new Date(now.getTime() - PENDING_GRACE_MS - HOUR_MS));
    storage.failRemove = true;
    expect(await cleanup.sweep(now)).toEqual({ removed: 0, failed: 3 });
    expect(
      await t.prisma.mediaUpload.findMany({ select: { status: true, attempts: true } }),
    ).toEqual(Array(3).fill({ status: 'DELETING', attempts: 1 }));

    storage.failRemove = false;
    const early = new Date(now.getTime() + CLAIM_LEASE_MS - 60_000);
    expect(await cleanup.sweep(early)).toEqual({ removed: 0, failed: 0 });
    expect(storage.removeCalls).toHaveLength(1);

    const later = new Date(now.getTime() + CLAIM_LEASE_MS + 60_000);
    expect(await cleanup.sweep(later)).toEqual({ removed: 3, failed: 0 });
    expect(storage.removed).toHaveLength(3);
    expect(await t.prisma.mediaUpload.count()).toBe(0);
  });

  it('UC-11.1/AC11 anh dang bi don thi khong gan duoc: 422, khong tao danh gia', async () => {
    const key = await uploadPhoto(t, storage, w.buyer);
    await t.prisma.mediaUpload.update({
      where: { storageKey: key },
      data: { status: 'DELETING', claimedAt: new Date() },
    });
    const { orderItemId } = await w.deliveredItem();
    const response = await t.http
      .post('/api/reviews')
      .set(w.buyer.auth)
      .send({ orderItemId, rating: 5, media: [{ key }] })
      .expect(422);
    expect(response.body.code).toBe('INVALID_MEDIA');
    expect(await t.prisma.review.count()).toBe(0);
    expect(await t.prisma.reviewMedia.count()).toBe(0);
  });
});
