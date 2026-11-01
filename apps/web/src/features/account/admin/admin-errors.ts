import {
  classifyRequestError,
  requestErrorCode,
  type RequestErrorKind,
  type RequestTarget,
  shouldRetryRequest,
} from '@/core';

import { SessionChangedError } from '../session-sync.js';

/**
 * Nhom loi cua man quan tri: cac nhom HTTP chung o core/request-errors (LOG#adr-039), them
 * 'session' = phien da doi giua chung, ket qua bi bo, khong bao gi.
 */
export type AdminErrorKind = 'session' | RequestErrorKind;

export function classifyAdminError(error: unknown, target: RequestTarget): AdminErrorKind {
  if (error instanceof SessionChangedError) return 'session';
  return classifyRequestError(error, target);
}

export function shouldRetryAdminQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof SessionChangedError) return false;
  return shouldRetryRequest(failureCount, error);
}

export const adminErrorCode = requestErrorCode;

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
