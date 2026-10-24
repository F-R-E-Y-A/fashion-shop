import { ApiError } from '@/core';

import { SessionChangedError } from '../session-sync.js';

/**
 * Nhom loi cua man quan tri. Moi nhom mot cach xu ly, khong tu doan theo chuoi message:
 * - session: phien da doi giua chung, ket qua bi bo, khong bao gi;
 * - forbidden: may chu noi khong con vai ADMIN (khong dang xuat ca tai khoan);
 * - unknown: POST da gui nhung khong biet may chu co thuc hien chua (het gio, mat mang, 5xx).
 */
export type AdminErrorKind =
  | 'session'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'invalid'
  | 'conflict'
  | 'rejected'
  | 'unknown'
  | 'unavailable';

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export function classifyAdminError(
  error: unknown,
  target: 'list' | 'detail' | 'mutation',
): AdminErrorKind {
  if (error instanceof SessionChangedError) return 'session';
  if (error instanceof ApiError) {
    const status = error.body.statusCode;
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not-found';
    // Id sai dang UUID tra 400: voi chi tiet, nguoi dung chi can biet "khong tim thay".
    if (status === 400) return target === 'list' ? 'invalid' : 'not-found';
    if (status === 409) return 'conflict';
    if (status >= 400 && status < 500) return 'rejected';
    // 5xx sau mot POST (502/504 qua proxy) khong chung minh may chu chua ghi.
    return target === 'mutation' ? 'unknown' : 'unavailable';
  }
  if (target === 'mutation' && (isAbortLike(error) || error instanceof TypeError)) return 'unknown';
  return target === 'mutation' ? 'unknown' : 'unavailable';
}

/** Query chi thu lai mot lan voi loi tam thoi (5xx, mang); khong bao gio voi 4xx hay doi phien. */
export function shouldRetryAdminQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof SessionChangedError || isAbortLike(error)) return false;
  if (error instanceof ApiError && error.body.statusCode < 500) return false;
  return failureCount < 1;
}

export function adminErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.body.code : undefined;
}

export const ADMIN_MESSAGES = {
  unauthenticated: 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.',
  listUnavailable: 'Không tải được danh sách người dùng. Kiểm tra kết nối rồi thử lại.',
  listInvalid: 'Yêu cầu danh sách không hợp lệ.',
  detailUnavailable: 'Không tải được thông tin tài khoản. Kiểm tra kết nối rồi thử lại.',
  notFound: 'Không tìm thấy tài khoản này.',
  conflict: 'Trạng thái tài khoản vừa thay đổi ở nơi khác. Thông tin đã được tải lại.',
  cannotLockSelf: 'Bạn không thể tự khóa tài khoản của mình.',
  rejected: 'Máy chủ từ chối thao tác này.',
  unknown:
    'Chưa xác định được kết quả: thao tác có thể đã được thực hiện. Hãy kiểm tra lại trạng thái trước khi thử tiếp.',
  forbiddenAction: 'Tài khoản của bạn không còn quyền quản trị.',
} as const;
