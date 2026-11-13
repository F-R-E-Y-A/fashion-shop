import { classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PromotionStatus = 'ACTIVE' | 'INACTIVE';

export interface AdminPromotionItem {
  id: string;
  name: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount: string | null;
  minOrderAmount: string | null;
  conditions: Record<string, unknown> | null;
  status: PromotionStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AdminPromotionDetail = AdminPromotionItem;

export interface AdminPromotionListResponse {
  items: AdminPromotionItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateAdminPromotionPayload {
  id?: string;
  name: string;
  discountType: DiscountType;
  discountValue: string;
  maxDiscountAmount?: string | null;
  minOrderAmount?: string | null;
  conditions?: Record<string, unknown> | null;
  status?: PromotionStatus;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface UpdateAdminPromotionPayload {
  name?: string;
  discountType?: DiscountType;
  discountValue?: string;
  maxDiscountAmount?: string | null;
  minOrderAmount?: string | null;
  conditions?: Record<string, unknown> | null;
  status?: PromotionStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  expectedUpdatedAt?: string;
}

export const adminPromotionsKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('promotions'), actorId] as const,
  lists: (actorId: string) => [...adminPromotionsKeys.all(actorId), 'list'] as const,
  list: (actorId: string, page: number, pageSize: number) =>
    [...adminPromotionsKeys.all(actorId), 'list', page, pageSize] as const,
  detail: (actorId: string, id: string) =>
    [...adminPromotionsKeys.all(actorId), 'detail', id] as const,
  uncertainMarker: (actorId: string, type: 'create' | 'edit' | 'status', idOrKey: string) =>
    ['uncertain', 'admin', 'promotions', actorId, type, idOrKey] as const,
};

/**
 * Kiểm tra chiến dịch có cấu hình điều kiện JsonB phức tạp hay không.
 * Nếu conditions không phải là null/undefined và không phải plain object rỗng -> Chỉ xem (Read-only).
 */
export function isComplexPromotion(promo: { conditions?: unknown }): boolean {
  if (promo.conditions === null || promo.conditions === undefined) return false;
  if (typeof promo.conditions === 'object' && !Array.isArray(promo.conditions)) {
    return Object.keys(promo.conditions as Record<string, unknown>).length > 0;
  }
  return true;
}

export function sanitizeAdminReturnUrl(
  raw: string | null | undefined,
  fallback = '/admin/promotions',
): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/admin/promotions')) return fallback;
  if (raw.startsWith('//') || raw.includes('\\')) return fallback;
  return raw;
}

export function arePromotionFieldValuesEqual(field: string, val1: unknown, val2: unknown): boolean {
  if (field === 'discountValue' || field === 'maxDiscountAmount' || field === 'minOrderAmount') {
    const num1 = val1 === null || val1 === undefined || val1 === '' ? null : Number(val1);
    const num2 = val2 === null || val2 === undefined || val2 === '' ? null : Number(val2);
    if (num1 === null && num2 === null) return true;
    if (num1 === null || num2 === null) return false;
    return num1 === num2;
  }
  if (field === 'startsAt' || field === 'endsAt') {
    const t1 = val1 ? new Date(val1 as string).getTime() : null;
    const t2 = val2 ? new Date(val2 as string).getTime() : null;
    return t1 === t2;
  }
  return String(val1 ?? '').trim() === String(val2 ?? '').trim();
}

export function doesPromotionMatchPayload(
  p: AdminPromotionDetail,
  payload: Record<string, unknown>,
): boolean {
  if (payload.name !== undefined && p.name !== String(payload.name).trim()) return false;
  if (payload.discountType !== undefined && p.discountType !== payload.discountType) return false;
  if (
    payload.discountValue !== undefined &&
    Number(p.discountValue) !== Number(payload.discountValue)
  ) {
    return false;
  }
  if (payload.status !== undefined && p.status !== payload.status) return false;
  return true;
}

/** Chuyển đổi UTC ISO 8601 sang chuỗi 'YYYY-MM-DDTHH:mm' cho input datetime-local theo giờ người dùng. */
export function utcIsoToLocalDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/** Chuyển đổi chuỗi input datetime-local 'YYYY-MM-DDTHH:mm' sang UTC ISO 8601. */
export function localDateTimeLocalToUtcIso(localStr: string): string {
  if (!localStr) return '';
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Định dạng ngày giờ hiển thị dạng 'DD/MM/YYYY HH:mm' kèm múi giờ. */
export function formatDisplayDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Không giới hạn';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Định dạng tiền tệ VNĐ. */
export function formatCurrencyVnd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) return String(value);
  return `${num.toLocaleString('vi-VN')} đ`;
}

export function promotionErrorText(error: unknown, target: RequestTarget = 'detail'): string {
  const code = classifyRequestError(error, target);
  switch (code) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'forbidden':
      return 'Tài khoản của bạn không có quyền quản trị khuyến mãi.';
    case 'not-found':
      return 'Không tìm thấy chương trình khuyến mãi yêu cầu.';
    case 'conflict':
      return 'Dữ liệu đã bị thay đổi bởi phiên làm việc khác. Vui lòng kiểm tra lại.';
    case 'invalid':
      return 'Thông tin chiến dịch không hợp lệ. Vui lòng kiểm tra các trường đã nhập.';
    default:
      return 'Không thể kết nối tới máy chủ. Vui lòng thử lại sau.';
  }
}
