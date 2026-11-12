import { classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

export interface AdminVoucher {
  id: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  maxDiscountAmount: string | null;
  minOrderAmount: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usageCount: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVoucherListResponse {
  items: AdminVoucher[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListAdminVouchersQuery {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  page?: number;
  pageSize?: number;
}

export interface CreateAdminVoucherInput {
  code: string;
  status?: 'ACTIVE' | 'INACTIVE';
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  maxDiscountAmount?: string | null;
  minOrderAmount?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface UpdateAdminVoucherInput {
  code?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: string;
  maxDiscountAmount?: string | null;
  minOrderAmount?: string | null;
  usageLimit?: number | null;
  perUserLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  expectedUpdatedAt?: string;
}

export interface UncertainActionMarker {
  type: 'create' | 'edit';
  id?: string;
  code: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export const adminVouchersKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('vouchers'), actorId] as const,
  lists: (actorId: string) => [...adminVouchersKeys.all(actorId), 'list'] as const,
  list: (actorId: string, query: ListAdminVouchersQuery) =>
    [
      ...adminVouchersKeys.all(actorId),
      'list',
      query.search ?? '',
      query.status ?? '',
      query.page ?? 1,
      query.pageSize ?? 12,
    ] as const,
  detail: (actorId: string, id: string) =>
    [...adminVouchersKeys.all(actorId), 'detail', id] as const,
  uncertainMarker: (actorId: string, type: 'create' | 'edit', idOrCode: string) =>
    [...adminVouchersKeys.all(actorId), 'uncertain', type, idOrCode] as const,
};

export function voucherStatusBadge(voucher: {
  status: 'ACTIVE' | 'INACTIVE';
  startsAt?: string | null;
  endsAt?: string | null;
}): { text: string; variant: 'active' | 'inactive' | 'scheduled' | 'expired' } {
  if (voucher.status === 'INACTIVE') {
    return { text: 'Ngừng hoạt động', variant: 'inactive' };
  }
  const now = new Date();
  if (voucher.startsAt && new Date(voucher.startsAt) > now) {
    return { text: 'Chưa tới hạn', variant: 'scheduled' };
  }
  if (voucher.endsAt && new Date(voucher.endsAt) < now) {
    return { text: 'Hết hạn', variant: 'expired' };
  }
  return { text: 'Đang hoạt động', variant: 'active' };
}

export function voucherErrorText(error: unknown, target: RequestTarget): string {
  switch (classifyRequestError(error, target)) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
    case 'forbidden':
      return 'Tài khoản của bạn không còn quyền quản trị.';
    case 'not-found':
      return 'Không tìm thấy mã giảm giá này.';
    case 'invalid':
      return 'Dữ liệu mã giảm giá không hợp lệ.';
    default:
      return 'Không thể kết nối đến máy chủ. Kiểm tra kết nối rồi thử lại.';
  }
}

/** Chuyển đổi an toàn chuỗi ISO UTC sang định dạng YYYY-MM-DDTHH:mm theo giờ địa phương */
export function utcIsoToLocalDateTimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Chuyển đổi chuỗi YYYY-MM-DDTHH:mm giờ địa phương sang chuỗi chuẩn ISO UTC */
export function localDateTimeLocalToUtcIso(localStr: string): string {
  if (!localStr) return '';
  const date = new Date(localStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

/** Đảm bảo đường dẫn quay lại nằm trong không gian quản trị /admin/vouchers, chống open redirect */
export function sanitizeAdminReturnUrl(raw: unknown, defaultUrl = '/admin/vouchers'): string {
  if (typeof raw !== 'string') return defaultUrl;
  if (!raw.startsWith('/admin/vouchers')) return defaultUrl;
  if (raw.startsWith('/admin/vouchers//') || raw.includes('://')) return defaultUrl;
  return raw;
}

/** So sánh hai giá trị số thập phân/chuỗi số có bằng nhau không */
export function areDecimalsEqual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === '') {
    return b === null || b === undefined || b === '';
  }
  if (b === null || b === undefined || b === '') return false;
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isNaN(numA) || Number.isNaN(numB)) return false;
  return numA === numB;
}

/** So sánh hai giá trị ngày tháng có cùng mốc thời gian không */
export function areDatesEqual(a: unknown, b: unknown): boolean {
  if (!a) return !b;
  if (!b) return false;
  const timeA = new Date(a as string | number | Date).getTime();
  const timeB = new Date(b as string | number | Date).getTime();
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return false;
  return timeA === timeB;
}

/** So sánh hai giá trị của một trường voucher cụ thể có tương đương ngữ nghĩa không */
export function areVoucherFieldValuesEqual(field: string, val1: unknown, val2: unknown): boolean {
  if (field === 'discountValue' || field === 'maxDiscountAmount' || field === 'minOrderAmount') {
    return areDecimalsEqual(val1, val2);
  }
  if (field === 'usageLimit' || field === 'perUserLimit') {
    if (val1 === null || val1 === undefined || val1 === '') {
      return val2 === null || val2 === undefined || val2 === '';
    }
    if (val2 === null || val2 === undefined || val2 === '') return false;
    return Number(val1) === Number(val2);
  }
  if (field === 'startsAt' || field === 'endsAt') {
    return areDatesEqual(val1, val2);
  }
  if (field === 'code') {
    return (
      String(val1 ?? '')
        .trim()
        .toUpperCase() ===
      String(val2 ?? '')
        .trim()
        .toUpperCase()
    );
  }
  return val1 === val2;
}

/** Kiểm tra thực tế voucher từ máy chủ có phản ánh đầy đủ payload mutation đã gửi không */
export function doesVoucherMatchPayload(
  voucher: AdminVoucher,
  payload: Record<string, unknown>,
): boolean {
  for (const [key, expectedVal] of Object.entries(payload)) {
    if (key === 'expectedUpdatedAt') continue;
    if (expectedVal === undefined) continue;
    const actualVal = (voucher as unknown as Record<string, unknown>)[key];
    if (!areVoucherFieldValuesEqual(key, actualVal, expectedVal)) {
      return false;
    }
  }
  return true;
}
