import { describe, expect, it } from 'vitest';

import { FitFeedback, ReviewReportReason, ReviewStatus } from '../../generated/prisma/client.js';
import { FIT_FEEDBACKS, MEDIA_KEY_PATTERN, REPORT_REASONS } from './dto/review-input.dto.js';
import { ADMIN_REVIEW_STATUSES } from './dto/review-query.dto.js';
import {
  canEditReview,
  editDeadline,
  moderationFor,
  needsManualReview,
  normalizeContent,
  ratingSummary,
  reviewDeadline,
  reviewerDisplayName,
  reviewWindowStart,
} from './review-policy.js';

const DAY_MS = 86_400_000;
const at = (iso: string) => new Date(iso);

describe('ADR-054 luat danh gia', () => {
  it('DTO khai lai enum (luat ranh gioi): phai trung tung gia tri voi Prisma', () => {
    expect([...FIT_FEEDBACKS].sort()).toEqual(Object.values(FitFeedback).sort());
    expect([...REPORT_REASONS].sort()).toEqual(Object.values(ReviewReportReason).sort());
    expect([...ADMIN_REVIEW_STATUSES].sort()).toEqual(Object.values(ReviewStatus).sort());
  });

  it('han viet 30 ngay tu luc giao; cua so loc dung bang han', () => {
    const delivered = at('2026-11-01T10:00:00.000Z');
    expect(reviewDeadline(delivered).toISOString()).toBe('2026-12-01T10:00:00.000Z');
    expect(reviewWindowStart(at('2026-12-01T10:00:00.000Z')).getTime()).toBe(delivered.getTime());
  });

  it('sua mot lan, trong 30 ngay, khong sua khi da bi an', () => {
    const createdAt = at('2026-11-01T00:00:00.000Z');
    const review = { editCount: 0, createdAt, moderationStatus: 'APPROVED' as const };
    const deadline = editDeadline(createdAt);
    expect(canEditReview(review, deadline)).toBe(true);
    expect(canEditReview(review, new Date(deadline.getTime() + 1))).toBe(false);
    expect(canEditReview({ ...review, editCount: 1 }, createdAt)).toBe(false);
    expect(canEditReview({ ...review, moderationStatus: 'REJECTED' }, createdAt)).toBe(false);
    expect(canEditReview({ ...review, moderationStatus: 'PENDING' }, createdAt)).toBe(true);
    expect(deadline.getTime() - createdAt.getTime()).toBe(30 * DAY_MS);
  });

  it.each([
    ['Hàng như đéo gì', true],
    ['ĐM giao chậm', true],
    ['vcl đẹp', true],
    ['đồ óc chó', true],
    ['Inbox 0901234567 nhé', true],
    ['Gọi +84 901 234 567', true],
    ['Zalo 090.123.4567', true],
    ['https://shop-khac.vn giá rẻ', true],
    ['Vào www.abc.com xem', true],
    ['Buổi sáng mặc rất mát', false],
    ['Lon nước ngọt tặng kèm, các bạn nên mua', false],
    ['Cao 160cm nặng 50kg mặc size M vừa', false],
    ['Mã đơn 12345678901 giao nhanh', false],
    ['Đặc biệt thích màu này', false],
  ])('cho duyet tay "%s" -> %s', (content, expected) => {
    expect(needsManualReview(content)).toBe(expected);
  });

  it('co anh thi luon cho duyet; chu sach hoac khong chu thi dang ngay', () => {
    expect(moderationFor({ content: 'Đẹp', mediaCount: 1 })).toBe('PENDING');
    expect(moderationFor({ content: 'Đẹp', mediaCount: 0 })).toBe('APPROVED');
    expect(moderationFor({ content: null, mediaCount: 0 })).toBe('APPROVED');
    expect(moderationFor({ content: 'vcl', mediaCount: 0 })).toBe('PENDING');
  });

  it('chuan hoa noi dung: NFC, xuong dong LF, cat khoang trang, rong thanh null', () => {
    expect(normalizeContent('  Áo\r\nđẹp \r ')).toBe('Áo\nđẹp');
    expect(normalizeContent('Ao'.normalize('NFD'))).toBe('Ao');
    expect(normalizeContent('Đẹp'.normalize('NFD'))).toBe('Đẹp'.normalize('NFC'));
    expect(normalizeContent('   ')).toBeNull();
    expect(normalizeContent(null)).toBeNull();
    expect(normalizeContent(undefined)).toBeNull();
  });

  it('ten hien: hai tu cuoi, an danh thi che, khong bao gio lo email', () => {
    const name = (fullName: string | null, isAnonymous = false, email = 'khach.hang@mail.test') =>
      reviewerDisplayName({ fullName, email, isAnonymous });
    expect(name('Nguyễn Thị Minh Anh')).toBe('Minh Anh');
    expect(name('  Trần   Bảo  ')).toBe('Trần Bảo');
    expect(name('Nguyễn Thị Minh Anh', true)).toBe('N*****h');
    expect(name(null)).toBe('k*****g');
    expect(name('   ')).toBe('k*****g');
    expect(name(null, true, 'a@mail.test')).toBe('*');
    for (const shown of [name(null), name(null, true), name('A B C', true)]) {
      expect(shown).not.toContain('@');
    }
  });

  it('diem trung binh lam tron 2 chu so; chua co danh gia thi 0', () => {
    expect(ratingSummary([])).toEqual({ average: 0, count: 0 });
    expect(
      ratingSummary([
        { rating: 5, count: 1 },
        { rating: 4, count: 1 },
        { rating: 1, count: 1 },
      ]),
    ).toEqual({ average: 3.33, count: 3 });
    expect(
      ratingSummary([
        { rating: 5, count: 2 },
        { rating: 4, count: 1 },
      ]),
    ).toEqual({ average: 4.67, count: 3 });
  });

  it('khoa anh: chu, so, gach; khong cho .. hay dau cach', () => {
    expect(
      MEDIA_KEY_PATTERN.test('freya/reviews/0f6a3c1e-1111-4222-8333-444455556666/Ab_c-1'),
    ).toBe(true);
    for (const key of ['../etc/passwd', '/freya/x', 'freya/re views/x', 'freya/x.jpg', '']) {
      expect(MEDIA_KEY_PATTERN.test(key)).toBe(false);
    }
  });
});
