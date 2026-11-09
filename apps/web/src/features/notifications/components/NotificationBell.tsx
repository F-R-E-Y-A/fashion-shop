import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/features/account';

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  notificationKeys,
  type NotificationListResponse,
} from '../api/notifications.api.js';
import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  isAdmin?: boolean;
  autoFetch?: boolean;
}

export function NotificationBell({ isAdmin = false, autoFetch = true }: NotificationBellProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const queryKey = isAdmin ? notificationKeys.adminList() : notificationKeys.userList(user?.id);

  const shouldFetch = open || autoFetch;

  const { data } = useQuery<NotificationListResponse>({
    queryKey,
    queryFn: ({ signal }) => getNotifications(isAdmin, signal),
    enabled: shouldFetch && (Boolean(user) || isAdmin),
    staleTime: 10_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id, isAdmin),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(isAdmin),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  // Đóng popover khi click ngoài hoặc bấm phím Escape
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Lắng nghe SSE thời gian thực nếu hỗ trợ EventSource
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const streamUrl = isAdmin ? '/api/admin/notifications/stream' : '/api/notifications/stream';
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(streamUrl, { withCredentials: true });
      eventSource.addEventListener('notification', () => {
        void queryClient.invalidateQueries({ queryKey });
      });
    } catch {
      // Bỏ qua lỗi kết nối SSE
    }

    return () => {
      eventSource?.close();
    };
  }, [isAdmin, queryClient, queryKey]);

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const handleItemClick = (item: NotificationItem) => {
    if (!item.isRead) {
      markReadMutation.mutate(item.id);
    }
    setOpen(false);
    if (item.link) {
      navigate(item.link);
    }
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={`Thông báo (${unreadCount} chưa đọc)`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={styles.popover} role="dialog" aria-label="Danh sách thông báo">
          <div className={styles.header}>
            <h3 className={styles.title}>Thông báo</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className={styles.empty}>Bạn chưa có thông báo nào</div>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${!item.isRead ? styles.itemUnread : ''}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={styles.itemHeader}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      <time className={styles.itemDate}>
                        {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                      </time>
                    </div>
                    <p className={styles.itemMessage}>{item.message}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
