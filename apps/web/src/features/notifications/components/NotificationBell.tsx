import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { isAdminQueryForActor } from '@/core';
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

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function NotificationBell({ isAdmin = false, autoFetch = true }: NotificationBellProps) {
  const auth = useAuth();
  const user = auth?.user ?? null;
  const request =
    typeof auth?.authenticatedRequest === 'function' ? auth.authenticatedRequest : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [forbiddenActorId, setForbiddenActorId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const actorId = user?.id ?? '';
  const forbidden = isAdmin && Boolean(actorId) && forbiddenActorId === actorId;

  const handleForbidden = useCallback(() => {
    if (!isAdmin || !actorId) return;
    setForbiddenActorId(actorId);
    setOpen(false);
    const filters = {
      predicate: (query: Parameters<typeof isAdminQueryForActor>[0]) =>
        isAdminQueryForActor(query, actorId),
    };
    void queryClient.cancelQueries(filters);
    queryClient.removeQueries(filters);
  }, [actorId, isAdmin, queryClient]);

  const queryKey = isAdmin
    ? notificationKeys.adminList(user?.id)
    : notificationKeys.userList(user?.id);

  const shouldFetch = open || autoFetch;

  const { data } = useQuery<NotificationListResponse>({
    queryKey,
    queryFn: ({ signal }) =>
      getNotifications(isAdmin, signal, {
        request,
        onForbidden: handleForbidden,
      }),
    enabled: shouldFetch && Boolean(user) && !forbidden,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      markNotificationRead(id, isAdmin, {
        request,
        onForbidden: handleForbidden,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () =>
      markAllNotificationsRead(isAdmin, {
        request,
        onForbidden: handleForbidden,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  // Đưa focus vào hộp thông báo khi mở, giữ Tab trong hộp và đóng bằng click ngoài / Escape trả focus
  useEffect(() => {
    if (!open) return;

    const dialogEl = popoverRef.current;
    if (dialogEl) {
      const firstFocusable = dialogEl.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstFocusable ?? dialogEl).focus();
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        bellButtonRef.current?.focus();
        return;
      }
      if (event.key === 'Tab' && popoverRef.current) {
        const focusables = Array.from(
          popoverRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusables.length === 0) {
          event.preventDefault();
          popoverRef.current.focus();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey) {
          if (active === first || !popoverRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !popoverRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

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
        ref={bellButtonRef}
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
        <div
          ref={popoverRef}
          className={styles.popover}
          role="dialog"
          aria-label="Danh sách thông báo"
          tabIndex={-1}
        >
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
