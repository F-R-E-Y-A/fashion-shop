import { type FocusEvent, useCallback, useEffect, useRef } from 'react';

import styles from './ActionFeedback.module.css';

export type ActionFeedbackTone = 'success' | 'error' | 'warning';

export interface ActionFeedbackAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ActionFeedbackProps {
  /** Dinh danh rieng cua tung lan hien thong bao (khong dung noi dung chuoi). */
  noticeKey: string | number;
  /** Pham vi phien hien tai (vd: `${actorId}:${sessionEpoch}`) de don timer khi doi phien. */
  sessionScope: string;
  tone: ActionFeedbackTone;
  message: string;
  onDismiss?: () => void;
  action?: ActionFeedbackAction;
  /** Mac dinh: an nut dong khi la warning co thao tac doi chieu de tranh mat duong xu ly. */
  dismissible?: boolean;
  /** Mac dinh 5000ms cho tone="success". */
  durationMs?: number;
  className?: string;
}

const DEFAULT_SUCCESS_DURATION_MS = 5000;

/**
 * Thong bao phan hoi thao tac admin thuan tuy hien thi/timer:
 * - `success`: `role="status"`, khong gianh focus, tu dong sau 5s, pause doc lap khi hover/focus
 *   va tiep tuc dung thoi gian con lai.
 * - `error` / `warning`: `role="alert"`, khong tu dong, giu lai de xu ly hoac doi chieu.
 */
export function ActionFeedback({
  noticeKey,
  sessionScope,
  tone,
  message,
  onDismiss,
  action,
  dismissible,
  durationMs = DEFAULT_SUCCESS_DURATION_MS,
  className,
}: ActionFeedbackProps) {
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const remainingRef = useRef<number>(durationMs);
  const activeTokenRef = useRef<{ noticeKey: string | number; sessionScope: string } | null>(null);
  const onDismissRef = useRef(onDismiss);
  const hasDismiss = Boolean(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleRemaining = useCallback(
    (token: { noticeKey: string | number; sessionScope: string }) => {
      clearTimer();
      if (hoveredRef.current || focusedRef.current) return;
      if (remainingRef.current <= 0) {
        if (activeTokenRef.current === token) {
          onDismissRef.current?.();
        }
        return;
      }
      startedAtRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        startedAtRef.current = null;
        if (activeTokenRef.current === token) {
          onDismissRef.current?.();
        }
      }, remainingRef.current);
    },
    [clearTimer],
  );

  const pauseTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimer();
    if (startedAtRef.current !== null) {
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      startedAtRef.current = null;
    }
  }, [clearTimer]);

  const resumeIfUnpaused = useCallback(() => {
    if (tone !== 'success' || !onDismissRef.current) return;
    if (hoveredRef.current || focusedRef.current) return;
    const token = activeTokenRef.current;
    if (!token) return;
    scheduleRemaining(token);
  }, [scheduleRemaining, tone]);

  useEffect(() => {
    clearTimer();
    startedAtRef.current = null;
    remainingRef.current = durationMs;

    if (tone !== 'success' || !hasDismiss) {
      activeTokenRef.current = null;
      return () => {
        clearTimer();
        activeTokenRef.current = null;
      };
    }

    const token = { noticeKey, sessionScope };
    activeTokenRef.current = token;
    scheduleRemaining(token);

    return () => {
      clearTimer();
      startedAtRef.current = null;
      if (activeTokenRef.current === token) {
        activeTokenRef.current = null;
      }
    };
  }, [clearTimer, durationMs, hasDismiss, noticeKey, scheduleRemaining, sessionScope, tone]);

  const handleMouseEnter = () => {
    hoveredRef.current = true;
    pauseTimer();
  };

  const handleMouseLeave = () => {
    hoveredRef.current = false;
    resumeIfUnpaused();
  };

  const handleFocus = () => {
    focusedRef.current = true;
    pauseTimer();
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    focusedRef.current = false;
    resumeIfUnpaused();
  };

  const handleManualDismiss = () => {
    clearTimer();
    startedAtRef.current = null;
    activeTokenRef.current = null;
    onDismiss?.();
  };

  const canDismiss =
    Boolean(onDismiss) && (dismissible ?? !(tone === 'warning' && Boolean(action)));

  const role = tone === 'success' ? 'status' : 'alert';
  const dataTone = tone === 'success' ? undefined : tone;

  return (
    <div
      className={className ? `${styles.feedback} ${className}` : styles.feedback}
      data-tone={dataTone}
      role={role}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <p className={styles.message}>{message}</p>
      {(action || canDismiss) && (
        <div className={styles.actions}>
          {action && (
            <button
              type="button"
              className={styles.actionButton}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
          {canDismiss && onDismiss && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleManualDismiss}
              aria-label="Đóng thông báo"
            >
              Đóng
            </button>
          )}
        </div>
      )}
    </div>
  );
}
