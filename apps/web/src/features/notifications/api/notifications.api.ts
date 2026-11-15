import {
  apiGet,
  apiPatch,
  apiPost,
  type ApiRequestOptions,
  classifyRequestError,
  sessionQueryKeys,
} from '@/core';

export type NotificationRequestFn = <T>(path: string, options?: ApiRequestOptions) => Promise<T>;

export interface NotificationRequestOptions {
  request?: NotificationRequestFn;
  onForbidden?: () => void;
}

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

export function isForbiddenError(err: unknown): boolean {
  if (classifyRequestError(err, 'list') === 'forbidden') return true;
  if (!err || typeof err !== 'object') return false;
  const candidate = err as {
    status?: number;
    statusCode?: number;
    body?: { status?: number; statusCode?: number };
    response?: { status?: number; statusCode?: number };
  };
  const status =
    candidate.status ??
    candidate.statusCode ??
    candidate.body?.statusCode ??
    candidate.body?.status ??
    candidate.response?.status ??
    candidate.response?.statusCode;
  return status === 403;
}

function resolveRequestOptions(
  optionsOrRequest?: NotificationRequestOptions | NotificationRequestFn,
): NotificationRequestOptions {
  if (typeof optionsOrRequest === 'function') {
    return { request: optionsOrRequest };
  }
  return optionsOrRequest ?? {};
}

export async function getNotifications(
  isAdminOrRequest: boolean | NotificationRequestFn = false,
  signalOrIsAdmin?: AbortSignal | boolean,
  optionsOrSignal?: NotificationRequestOptions | NotificationRequestFn | AbortSignal,
  maybeOptions?: NotificationRequestOptions,
): Promise<NotificationListResponse> {
  let isAdmin: boolean;
  let signal: AbortSignal | undefined;
  let options: NotificationRequestOptions;

  if (typeof isAdminOrRequest === 'function') {
    isAdmin = typeof signalOrIsAdmin === 'boolean' ? signalOrIsAdmin : false;
    signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : undefined;
    options = { ...maybeOptions, request: isAdminOrRequest };
  } else {
    isAdmin = isAdminOrRequest;
    signal = signalOrIsAdmin instanceof AbortSignal ? signalOrIsAdmin : undefined;
    options = resolveRequestOptions(
      optionsOrSignal instanceof AbortSignal ? maybeOptions : optionsOrSignal,
    );
  }

  const path = isAdmin ? '/admin/notifications' : '/notifications';
  try {
    if (options.request) {
      return await options.request<NotificationListResponse>(path, { signal });
    }
    return await apiGet<NotificationListResponse>(path, undefined, { signal });
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options.onForbidden?.();
    }
    throw err;
  }
}

export async function markNotificationRead(
  id: string,
  isAdmin = false,
  optionsOrRequest?: NotificationRequestOptions | NotificationRequestFn,
): Promise<NotificationItem> {
  const options = resolveRequestOptions(optionsOrRequest);
  const path = isAdmin ? `/admin/notifications/${id}/read` : `/notifications/${id}/read`;
  try {
    if (options.request) {
      return await options.request<NotificationItem>(path, { method: 'PATCH' });
    }
    return await apiPatch<NotificationItem>(path);
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options.onForbidden?.();
    }
    throw err;
  }
}

export async function markAllNotificationsRead(
  isAdmin = false,
  optionsOrRequest?: NotificationRequestOptions | NotificationRequestFn,
): Promise<{ count: number }> {
  const options = resolveRequestOptions(optionsOrRequest);
  const path = isAdmin ? '/admin/notifications/mark-all-read' : '/notifications/mark-all-read';
  try {
    if (options.request) {
      return await options.request<{ count: number }>(path, { method: 'POST' });
    }
    return await apiPost<{ count: number }>(path);
  } catch (err) {
    if (isAdmin && isForbiddenError(err)) {
      options.onForbidden?.();
    }
    throw err;
  }
}
