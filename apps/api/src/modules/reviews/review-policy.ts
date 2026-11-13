/**
 * Luat nghiep vu cua danh gia san pham (ADR-054), tach khoi Prisma de kiem bang bai don vi.
 * Day la chinh sach rieng cua Freya, khong khang dinh giong noi bo san nao khac.
 */

/** Khach viet duoc danh gia trong bao nhieu ngay ke tu lan don chuyen sang DELIVERED. */
export const REVIEW_WINDOW_DAYS = 30;
/** Sua duoc bao nhieu lan, trong bao nhieu ngay ke tu luc viet. */
export const REVIEW_MAX_EDITS = 1;
export const REVIEW_EDIT_WINDOW_DAYS = 30;

export const REVIEW_CONTENT_MAX = 1500;
export const REVIEW_REPLY_MAX = 1000;
export const REVIEW_NOTE_MAX = 500;
export const REVIEW_MEDIA_MAX = 5;
export const REVIEW_HEIGHT_RANGE = { min: 100, max: 230 } as const;
export const REVIEW_WEIGHT_RANGE = { min: 25, max: 250 } as const;

/**
 * Don o hai trang thai nay thi hang da toi tay khach. Hoan tien mot phan van danh gia duoc phan con
 * lai; hoan toan bo (REFUNDED) thi khong, vi thuong la tra hang.
 */
export const REVIEWABLE_ORDER_STATUSES = ['DELIVERED', 'PARTIALLY_REFUNDED'] as const;

const DAY_MS = 86_400_000;

export function reviewDeadline(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + REVIEW_WINDOW_DAYS * DAY_MS);
}

export function reviewWindowStart(now: Date): Date {
  return new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS);
}

export type ReviewModeration = 'PENDING' | 'APPROVED' | 'REJECTED';

export function editDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REVIEW_EDIT_WINDOW_DAYS * DAY_MS);
}

/** Danh gia bi an (REJECTED) la quyet dinh cuoi cua shop: khong cho sua de lach duyet. */
export function canEditReview(
  review: { editCount: number; createdAt: Date; moderationStatus: ReviewModeration },
  now: Date = new Date(),
): boolean {
  return (
    review.moderationStatus !== 'REJECTED' &&
    review.editCount < REVIEW_MAX_EDITS &&
    now.getTime() <= editDeadline(review.createdAt).getTime()
  );
}

/**
 * Tu tim tren chu thuong NFC, ranh gioi la ky tu khong phai chu/so (\b cua JS khong hieu chu co
 * dau). Danh sach co y giu dau: bo dau thi "lon", "cac", "buoi" trung tu thuong. Khop chi dua danh
 * gia vao hang cho duyet, khong tu choi, nen khop nham chi lam cham dang chu khong mat danh gia.
 */
const BLOCKED_TERMS = [
  'địt',
  'đụ',
  'đéo',
  'lồn',
  'cặc',
  'buồi',
  'đĩ',
  'đm',
  'đmm',
  'dmm',
  'vcl',
  'vkl',
  'clgt',
  'cmm',
  'óc chó',
  'súc vật',
];
const BLOCKED_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${BLOCKED_TERMS.join('|')})(?![\\p{L}\\p{N}])`,
  'u',
);
/** Link va so dien thoai trong danh gia thuong la quang cao hay lua dao: cho nguoi xem truoc. */
const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+/iu;
const PHONE_PATTERN = /(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){9}(?!\d)/u;

export function needsManualReview(content: string | null): boolean {
  if (!content) return false;
  const text = content.normalize('NFC').toLowerCase();
  return BLOCKED_PATTERN.test(text) || LINK_PATTERN.test(text) || PHONE_PATTERN.test(text);
}

/**
 * Chu sach va khong co anh thi dang ngay. Co anh hoac chu can xem thi cho duyet: anh khong loc tu
 * dong duoc, va danh gia chua duyet khong hien voi ai ngoai chinh nguoi viet.
 */
export function moderationFor(input: {
  content: string | null;
  mediaCount: number;
}): ReviewModeration {
  return input.mediaCount > 0 || needsManualReview(input.content) ? 'PENDING' : 'APPROVED';
}

/** Chuoi rong sau khi cat khoang trang thi coi nhu khong viet gi. */
export function normalizeContent(content: string | null | undefined): string | null {
  if (content === undefined || content === null) return null;
  const text = content.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  return text === '' ? null : text;
}

function maskName(value: string): string {
  const chars = Array.from(value.replace(/\s+/g, ''));
  if (chars.length <= 1) return '*';
  return `${chars[0]}*****${chars[chars.length - 1]}`;
}

/**
 * Ten hien cong khai. Khong bao gio lo email. An danh thi che giua ten; khong an danh thi lay hai
 * tu cuoi cua ho ten (ten goi kieu Viet), du de nhan ra ma khong dua ca ho ten len trang cong khai.
 */
export function reviewerDisplayName(input: {
  fullName: string | null;
  email: string;
  isAnonymous: boolean;
}): string {
  const fullName = input.fullName?.normalize('NFC').trim().replace(/\s+/g, ' ') || null;
  const emailName = input.email.split('@', 1)[0] ?? '';
  if (input.isAnonymous) return maskName(fullName ?? emailName);
  if (!fullName) return maskName(emailName);
  const words = fullName.split(' ');
  return words.length >= 3 ? words.slice(-2).join(' ') : fullName;
}

export interface RatingTally {
  rating: number;
  count: number;
}

/** Trung binh lam tron 2 chu so, khop cot DECIMAL(3,2); khong co danh gia thi 0. */
export function ratingSummary(tallies: readonly RatingTally[]): { average: number; count: number } {
  const count = tallies.reduce((sum, row) => sum + row.count, 0);
  if (count === 0) return { average: 0, count: 0 };
  const total = tallies.reduce((sum, row) => sum + row.rating * row.count, 0);
  return { average: Math.round((total / count) * 100) / 100, count };
}
