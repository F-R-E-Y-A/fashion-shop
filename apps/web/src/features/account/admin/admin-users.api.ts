import { type Page, sessionQueryKeys } from '@/core';

import type { AuthenticatedRequest } from '../api/profile-address.api.js';
import { userListApiParams, type UserListQuery, userListSignature } from './list-query.js';

/** Dung allowlist cua API quan tri (AdminUserResponse); khong them truong nao API khong tra. */
export interface AdminUser {
  id: string;
  email: string;
  status: string;
  roles: string[];
  emailVerifiedAt: string | null;
  createdAt: string;
}

export type AdminUserPage = Page<AdminUser>;

export type AdminUserAction = 'lock' | 'unlock';

/**
 * Moi key gan actorId (quan tri vien dang thao tac): du lieu cua actor nay khong bao gio hien cho
 * actor khac. Doi phien thi AuthProvider huy va xoa ca nhanh `all`, ke ca khi cung actor dang nhap lai.
 * Key danh sach = actor + chu ky dieu kien da chuan hoa (moi tham so tru trang) + trang.
 */
export const adminUserKeys = {
  all: sessionQueryKeys.adminResource('users'),
  actor: (actorId: string) => [...adminUserKeys.all, actorId] as const,
  lists: (actorId: string) => [...adminUserKeys.actor(actorId), 'list'] as const,
  list: (actorId: string, query: UserListQuery) =>
    [...adminUserKeys.lists(actorId), userListSignature(query), query.page] as const,
  detail: (actorId: string, id: string) => [...adminUserKeys.actor(actorId), 'detail', id] as const,
};

export const listAdminUsers = (
  request: AuthenticatedRequest,
  query: UserListQuery,
  signal?: AbortSignal,
): Promise<AdminUserPage> => request(`/admin/users?${userListApiParams(query)}`, { signal });

export const getAdminUser = (
  request: AuthenticatedRequest,
  id: string,
  signal?: AbortSignal,
): Promise<AdminUser> => request(`/admin/users/${encodeURIComponent(id)}`, { signal });

/** POST dong tu nghiep vu; khong co than yeu cau, nguoi thao tac do may chu lay tu access token. */
export const changeAdminUserStatus = (
  request: AuthenticatedRequest,
  id: string,
  action: AdminUserAction,
  signal?: AbortSignal,
): Promise<AdminUser> =>
  request(`/admin/users/${encodeURIComponent(id)}/${action}`, { method: 'POST', signal });
