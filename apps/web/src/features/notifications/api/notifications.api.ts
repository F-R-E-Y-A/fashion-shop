import { apiGet, apiPatch, apiPost, type ApiRequestOptions, sessionQueryKeys } from '@/core';

export type NotificationRequestFn = <T>(path: string, options?: ApiRequestOptions) => Promise<T>;

export interface NotificationItem {
  id: string;
  userId: string | null;
  forAdmin: boolean;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  orderId: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export const notificationKeys = {
  all: sessionQueryKeys.scope('notifications'),
  userList: (userId?: string) =>
    [...sessionQueryKeys.scope('notifications'), 'user', userId ?? 'guest'] as const,
  adminList: (actorId = 'admin') =>
    [...sessionQueryKeys.adminResource('notifications'), actorId, 'list'] as const,
  userUnread: (userId?: string) =>
    [...sessionQueryKeys.scope('notifications'), 'user-unread', userId ?? 'guest'] as const,
  adminUnread: (actorId = 'admin') =>
    [...sessionQueryKeys.adminResource('notifications'), actorId, 'unread'] as const,
};

function isForbiddenError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status =
    (err as { status?: number; statusCode?: number }).status ??
    (err as { statusCode?: number }).statusCode;
  return status === 403;
}

export async function getNotifications(
  isAdmin = false,
  signal?: AbortSignal,
  options?: {
    request?: NotificationRequestFn;
    onForbidden?: () => void;
  },
): Promise<NotificationListResponse> {
  const path = isAdmin ? '/admin/notifications' : '/notifications';
  try {
    if (options?.request) {
      return await options.request<NotificationListResponse>(path, { signal });
    }
    return await apiGet<NotificationListResponse>(path, undefined, { signal });
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options?.onForbidden?.();
    }
    return { items: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 };
  }
}

export async function markNotificationRead(
  id: string,
  isAdmin = false,
  options?: {
    request?: NotificationRequestFn;
    onForbidden?: () => void;
  },
): Promise<NotificationItem | null> {
  const path = isAdmin ? `/admin/notifications/${id}/read` : `/notifications/${id}/read`;
  try {
    if (options?.request) {
      return await options.request<NotificationItem>(path, { method: 'PATCH' });
    }
    return await apiPatch<NotificationItem>(path);
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options?.onForbidden?.();
    }
    return null;
  }
}

export async function markAllNotificationsRead(
  isAdmin = false,
  options?: {
    request?: NotificationRequestFn;
    onForbidden?: () => void;
  },
): Promise<{ count: number } | null> {
  const path = isAdmin ? '/admin/notifications/mark-all-read' : '/notifications/mark-all-read';
  try {
    if (options?.request) {
      return await options.request<{ count: number }>(path, { method: 'POST' });
    }
    return await apiPost<{ count: number }>(path);
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options?.onForbidden?.();
    }
    return null;
  }
}
