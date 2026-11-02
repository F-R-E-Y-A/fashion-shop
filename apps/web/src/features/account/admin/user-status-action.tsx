import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ComponentProps, useEffect, useRef, useState } from 'react';

import type { ConfirmDialog } from '@/ui';

import { SessionChangedError } from '../session-sync.js';
import { ADMIN_MESSAGES, adminErrorCode, classifyAdminError } from './admin-errors.js';
import { adminAccessGeneration, useAdminActor } from './admin-hooks.js';
import {
  type AdminUser,
  type AdminUserAction,
  adminUserKeys,
  type AdminUserPage,
  changeAdminUserStatus,
} from './admin-users.api.js';
import styles from './AdminUsers.module.css';

/** Het gio cho khoa/mo khoa. Het gio KHONG chung minh may chu chua ghi: chi cho kiem lai bang GET. */
export const ADMIN_ACTION_TIMEOUT_MS = 15_000;

export const STATUS_ACTION_COPY = {
  lock: {
    title: 'Khóa tài khoản này?',
    impacts: [
      'Người dùng bị đăng xuất khỏi mọi thiết bị ngay lập tức.',
      'Không đăng nhập được cho tới khi được mở khóa.',
      'Mở khóa sau này không khôi phục phiên cũ; người dùng phải đăng nhập lại.',
    ],
    confirm: 'Khóa tài khoản',
    pending: 'Đang khóa…',
    tone: 'danger',
    success: 'Đã khóa tài khoản. Mọi phiên đăng nhập của tài khoản này đã kết thúc.',
  },
  unlock: {
    title: 'Mở khóa tài khoản này?',
    impacts: [
      'Người dùng đăng nhập lại được bằng mật khẩu hiện tại.',
      'Không phiên nào được khôi phục tự động.',
    ],
    confirm: 'Mở khóa',
    pending: 'Đang mở khóa…',
    tone: 'primary',
    success: 'Đã mở khóa tài khoản. Người dùng cần đăng nhập lại.',
  },
} as const;

export interface StatusActionTarget {
  id: string;
  email: string;
  action: AdminUserAction;
}

interface ActionVariables {
  target: StatusActionTarget;
  actorId: string;
  /** Phien luc bam xac nhan; ket qua ve khi phien da doi (ke ca cung nguoi dang nhap lai) bi bo. */
  epoch: number;
  /** The he quyen luc bam; may chu tra 403 trong luc cho thi ket qua ve muon bi bo. */
  access: number;
}

export interface ActionNotice {
  tone: 'success' | 'error' | 'warning';
  text: string;
  recheck?: boolean;
}

/** Thay mot dong trong mot trang danh sach da cache; khong them, bot hay tinh lai total. */
function replaceInPage(page: AdminUserPage | undefined, updated: AdminUser) {
  if (!page) return page;
  return { ...page, items: page.items.map((item) => (item.id === updated.id ? updated : item)) };
}

/**
 * Luong khoa/mo khoa DUY NHAT, dung chung cho trang chi tiet va thao tac nhanh tren danh sach:
 * hop xac nhan, chan bam lap dong bo, het gio va ket qua chua ro, phien va the he quyen, huy GET cu
 * truoc khi ghi. Sau thanh cong moi danh sach cua actor duoc tai lai tu API: tai khoan co the roi bo
 * loc, doi trang, va total phai la so cua may chu chu khong tu tru tren mot trang.
 */
export function useUserStatusAction({
  actorId,
  markForbidden,
}: {
  actorId: string;
  markForbidden: () => void;
}) {
  const queryClient = useQueryClient();
  const { request, getSessionEpoch } = useAdminActor();
  const [dialog, setDialog] = useState<StatusActionTarget | null>(null);
  const [notice, setNotice] = useState<ActionNotice | null>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Dat DONG BO truoc mutate: hai cu bam trong cung mot khung hinh chi gui mot POST.
  const submittingRef = useRef(false);
  const dialogOpenRef = useRef(false);

  useEffect(() => {
    if (focusNotice > 0) noticeRef.current?.focus();
  }, [focusNotice]);

  /** Ket thuc mot lan thao tac: dong hop neu con mo va dua focus toi thong bao ket qua. */
  function finish(next: ActionNotice) {
    setNotice(next);
    if (dialogOpenRef.current) {
      dialogOpenRef.current = false;
      setDialog(null);
      setFocusNotice((count) => count + 1);
    }
  }

  /** Ket qua chi con dung khi cung phien va actor chua bi may chu tra 403 tu luc bam. */
  const stillCurrent = (variables: ActionVariables) =>
    getSessionEpoch() === variables.epoch &&
    adminAccessGeneration(queryClient, variables.actorId) === variables.access;

  const refreshFromServer = (actor: string, userId: string) => {
    void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(actor, userId) });
    void queryClient.invalidateQueries({ queryKey: adminUserKeys.lists(actor) });
  };

  const mutation = useMutation({
    mutationFn: async (variables: ActionVariables) => {
      if (!stillCurrent(variables)) throw new SessionChangedError();
      const { target } = variables;
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Het gio cho phan hoi', 'TimeoutError')),
        ADMIN_ACTION_TIMEOUT_MS,
      );
      try {
        return await changeAdminUserStatus(request, target.id, target.action, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    },
    retry: 0,
    onSuccess: async (updated, variables) => {
      if (!stillCurrent(variables)) return;
      // GET dang bay co the da doc trang thai TRUOC khi may chu ghi: huy roi moi ghi, de no khong ve
      // sau va de len (mot lan fetch thanh cong con xoa co "invalidated", nen invalidate khong cuu duoc).
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: adminUserKeys.detail(variables.actorId, updated.id),
        }),
        queryClient.cancelQueries({ queryKey: adminUserKeys.lists(variables.actorId) }),
      ]);
      if (!stillCurrent(variables)) return;
      queryClient.setQueryData(adminUserKeys.detail(variables.actorId, updated.id), updated);
      // Dong da hien doi trang thai ngay; danh sach co bo loc tu danh dau dong khong con khop. Tap,
      // total va trang luon lay lai tu API, khong suy ra tu mot trang.
      queryClient.setQueriesData<AdminUserPage>(
        { queryKey: adminUserKeys.lists(variables.actorId) },
        (page) => replaceInPage(page, updated),
      );
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.lists(variables.actorId) });
      finish({ tone: 'success', text: STATUS_ACTION_COPY[variables.target.action].success });
    },
    onError: (error, variables) => {
      if (!stillCurrent(variables)) return;
      const kind = classifyAdminError(error, 'mutation');
      if (kind === 'session') return;
      if (kind === 'forbidden') {
        dialogOpenRef.current = false;
        setDialog(null);
        markForbidden();
        return;
      }
      if (kind === 'conflict' || kind === 'not-found') {
        refreshFromServer(variables.actorId, variables.target.id);
      }
      const text =
        kind === 'unauthenticated'
          ? ADMIN_MESSAGES.unauthenticated
          : kind === 'conflict'
            ? ADMIN_MESSAGES.conflict
            : kind === 'not-found'
              ? ADMIN_MESSAGES.notFound
              : kind === 'unknown'
                ? ADMIN_MESSAGES.unknown
                : adminErrorCode(error) === 'CANNOT_LOCK_SELF'
                  ? ADMIN_MESSAGES.cannotLockSelf
                  : ADMIN_MESSAGES.rejected;
      finish({ tone: kind === 'unknown' ? 'warning' : 'error', text, recheck: kind === 'unknown' });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  /** Mo hop cho mot tai khoan; `opener` la nut da bam, focus tro ve do khi huy. */
  function open(target: StatusActionTarget, opener: HTMLElement | null) {
    if (submittingRef.current) return;
    setNotice(null);
    openerRef.current = opener;
    dialogOpenRef.current = true;
    setDialog(target);
  }

  function close() {
    dialogOpenRef.current = false;
    setDialog(null);
  }

  function confirm() {
    if (!dialog || submittingRef.current) return;
    submittingRef.current = true;
    mutation.mutate({
      target: dialog,
      actorId,
      epoch: getSessionEpoch(),
      access: adminAccessGeneration(queryClient, actorId),
    });
  }

  /** Ket qua chua ro: lay lai trang thai tu may chu bang GET; khong bao gio gui lai POST. */
  async function recheck() {
    const epoch = getSessionEpoch();
    const access = adminAccessGeneration(queryClient, actorId);
    const target = mutation.variables?.target;
    // Chi tiet dang an (thao tac tu danh sach) chi bi danh dau cu; query dang hien tai lai MOT lan.
    if (target) {
      await queryClient.invalidateQueries({
        queryKey: adminUserKeys.detail(actorId, target.id),
        refetchType: 'none',
      });
    }
    await queryClient.refetchQueries({ queryKey: adminUserKeys.actor(actorId), type: 'active' });
    if (getSessionEpoch() !== epoch || adminAccessGeneration(queryClient, actorId) !== access)
      return;
    const failed = queryClient
      .getQueryCache()
      .findAll({ queryKey: adminUserKeys.actor(actorId), type: 'active' })
      .some((query) => query.state.status === 'error');
    setNotice(
      failed
        ? { tone: 'error', text: ADMIN_MESSAGES.detailUnavailable, recheck: true }
        : { tone: 'success', text: 'Đã tải lại. Trạng thái hiển thị là trạng thái hiện tại.' },
    );
  }

  const copy = dialog ? STATUS_ACTION_COPY[dialog.action] : null;
  const pendingTarget = mutation.isPending ? (mutation.variables?.target ?? null) : null;

  const dialogProps: ComponentProps<typeof ConfirmDialog> = {
    open: copy !== null,
    title: copy?.title ?? '',
    subject: dialog?.email ?? '',
    impacts: copy?.impacts ?? [],
    confirmLabel: copy?.confirm ?? '',
    pendingLabel: copy?.pending ?? '',
    tone: copy?.tone ?? 'primary',
    pending: mutation.isPending,
    onConfirm: confirm,
    onClose: close,
    returnFocusRef: openerRef,
  };

  return {
    open,
    /** Dang co mot thao tac chay: moi nut thao tac khac bi chan cho toi khi xong. */
    busy: mutation.isPending,
    pendingTarget,
    dialogOpen: dialog !== null,
    dialogProps,
    notice,
    noticeRef,
    recheck,
  };
}

export type UserStatusActionState = ReturnType<typeof useUserStatusAction>;

/** Vung ket qua thao tac. Vung status luon co san de trinh doc man hinh doc duoc noi dung moi. */
export function StatusActionNotice({ action }: { action: UserStatusActionState }) {
  const { notice, noticeRef, pendingTarget, dialogOpen } = action;
  return (
    <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
      <div role="status">
        {notice?.tone === 'success' && (
          <p className={styles.notice} data-tone="success">
            {notice.text}
          </p>
        )}
        {pendingTarget && !dialogOpen && (
          <p className={styles.pendingLine}>
            {STATUS_ACTION_COPY[pendingTarget.action].pending} {pendingTarget.email}
          </p>
        )}
      </div>
      {notice && notice.tone !== 'success' && (
        <div className={styles.notice} data-tone={notice.tone} role="alert">
          <p>{notice.text}</p>
          {notice.recheck && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void action.recheck()}
            >
              Kiểm tra lại trạng thái
            </button>
          )}
        </div>
      )}
    </div>
  );
}
