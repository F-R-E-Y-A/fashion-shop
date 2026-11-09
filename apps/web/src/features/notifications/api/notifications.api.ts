import { apiGet, apiPatch, apiPost } from '@/core';

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
  all: ['notifications'] as const,
  userList: (userId?: string) => [...notificationKeys.all, 'user', userId ?? 'guest'] as const,
  adminList: () => [...notificationKeys.all, 'admin'] as const,
  userUnread: (userId?: string) =>
    [...notificationKeys.all, 'user-unread', userId ?? 'guest'] as const,
  adminUnread: () => [...notificationKeys.all, 'admin-unread'] as const,
};

export async function getNotifications(
  isAdmin = false,
  signal?: AbortSignal,
): Promise<NotificationListResponse> {
  try {
    return await apiGet<NotificationListResponse>(
      isAdmin ? '/admin/notifications' : '/notifications',
      undefined,
      { signal },
    );
  } catch {
    return { items: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 };
  }
}

export async function markNotificationRead(
  id: string,
  isAdmin = false,
): Promise<NotificationItem | null> {
  try {
    return await apiPatch<NotificationItem>(
      isAdmin ? `/admin/notifications/${id}/read` : `/notifications/${id}/read`,
    );
  } catch {
    return null;
  }
}

export async function markAllNotificationsRead(isAdmin = false): Promise<{ count: number } | null> {
  try {
    return await apiPost<{ count: number }>(
      isAdmin ? '/admin/notifications/mark-all-read' : '/notifications/mark-all-read',
    );
  } catch {
    return null;
  }
}
