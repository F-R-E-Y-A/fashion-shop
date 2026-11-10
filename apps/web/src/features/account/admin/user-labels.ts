import type { AdminUser } from './admin-users.api.js';

export const ADMIN_ROLE = 'ADMIN';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Đã khóa',
  PENDING_VERIFICATION: 'Chờ xác thực email',
  DISABLED: 'Đã vô hiệu hóa',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  CUSTOMER: 'Khách hàng',
};

/** Ma la (may chu them trang thai moi) thi hien nguyen ma, khong doan nghia. */
export const statusLabel = (status: string): string => STATUS_LABELS[status] ?? status;
export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

export function hasAdminRole(user: { roles: readonly string[] } | null | undefined): boolean {
  return user?.roles.includes(ADMIN_ROLE) ?? false;
}

/**
 * Thao tac giao dien cho phep tren mot tai khoan. Chi la UX: may chu van tu kiem quyen, trang thai
 * va tu khoa. Giao dien KHONG khoa tai khoan ADMIN, nhung API hien chua chan viec do (README users).
 */
export type UserActionState =
  { kind: 'lock' } | { kind: 'unlock' } | { kind: 'none'; reason: 'self' | 'admin' | 'status' };

export function userActionFor(user: AdminUser, actorId: string): UserActionState {
  if (user.status === 'LOCKED') {
    return user.id === actorId ? { kind: 'none', reason: 'self' } : { kind: 'unlock' };
  }
  if (user.id === actorId) return { kind: 'none', reason: 'self' };
  if (user.status !== 'ACTIVE') return { kind: 'none', reason: 'status' };
  if (user.roles.includes(ADMIN_ROLE)) return { kind: 'none', reason: 'admin' };
  return { kind: 'lock' };
}

export const ACTION_UNAVAILABLE_REASON = {
  self: 'Đây là tài khoản của bạn. Không thể tự khóa tài khoản đang dùng.',
  admin: 'Tài khoản quản trị viên không khóa được từ màn hình này.',
  status: 'Chỉ khóa được tài khoản đang hoạt động; mở khóa chỉ áp dụng cho tài khoản đã khóa.',
} as const;
