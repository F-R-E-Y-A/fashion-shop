import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ErrorNote, Loading } from '@/ui';

import {
  ADMIN_MESSAGES,
  adminErrorCode,
  classifyAdminError,
  shouldRetryAdminQuery,
} from './admin-errors.js';
import {
  adminAccessGeneration,
  formatAdminDateTime,
  useAdminActor,
  useAdminForbidden,
} from './admin-hooks.js';
import {
  type AdminUser,
  type AdminUserAction,
  adminUserKeys,
  type AdminUserPage,
  changeAdminUserStatus,
  getAdminUser,
} from './admin-users.api.js';
import { AdminForbidden } from './AdminForbidden.js';
import styles from './AdminUsers.module.css';
import { ConfirmDialog } from './ConfirmDialog.js';
import { readListReturn } from './page-param.js';
import { ACTION_UNAVAILABLE_REASON, userActionFor } from './user-labels.js';
import { RoleList, StatusBadge } from './UserBadges.js';

/** Het gio cho khoa/mo khoa. Het gio KHONG chung minh may chu chua ghi: chi cho kiem lai bang GET. */
export const ADMIN_ACTION_TIMEOUT_MS = 15_000;

interface ActionVariables {
  action: AdminUserAction;
  actorId: string;
  /** Phien luc bam xac nhan; ket qua ve khi phien da doi (ke ca cung nguoi dang nhap lai) bi bo. */
  epoch: number;
  /** The he quyen luc bam; may chu tra 403 trong luc cho thi ket qua ve muon bi bo. */
  access: number;
}

interface Notice {
  tone: 'success' | 'error' | 'warning';
  text: string;
  recheck?: boolean;
}

const DIALOG_COPY = {
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

/** Thay mot dong trong moi trang danh sach da cache cua actor nay. */
function replaceInPage(page: AdminUserPage | undefined, updated: AdminUser) {
  if (!page) return page;
  return { ...page, items: page.items.map((item) => (item.id === updated.id ? updated : item)) };
}

export function AdminUserDetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const backTo = readListReturn(location.state);
  const queryClient = useQueryClient();
  const { actorId, request, getSessionEpoch } = useAdminActor();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId);
  const [dialog, setDialog] = useState<AdminUserAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [focusNotice, setFocusNotice] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  // Dat DONG BO truoc mutate: hai cu bam trong cung mot khung hinh chi gui mot POST.
  const submittingRef = useRef(false);
  const dialogOpenRef = useRef(false);

  const detail = useQuery({
    queryKey: adminUserKeys.detail(actorId, id),
    queryFn: ({ signal }) => guardQuery(() => getAdminUser(request, id, signal)),
    enabled: Boolean(actorId) && !forbidden,
    retry: shouldRetryAdminQuery,
  });
  const errorKind = detail.error ? classifyAdminError(detail.error, 'detail') : null;

  useEffect(() => {
    if (focusNotice > 0) noticeRef.current?.focus();
  }, [focusNotice]);

  /** Ket thuc mot lan thao tac: dong hop neu con mo va dua focus toi thong bao ket qua. */
  function finish(next: Notice) {
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

  const refreshFromServer = (actor: string) => {
    void queryClient.invalidateQueries({ queryKey: adminUserKeys.detail(actor, id) });
    void queryClient.invalidateQueries({ queryKey: adminUserKeys.lists(actor) });
  };

  const action = useMutation({
    mutationFn: async ({ action: kind }: ActionVariables) => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Het gio cho phan hoi', 'TimeoutError')),
        ADMIN_ACTION_TIMEOUT_MS,
      );
      try {
        return await changeAdminUserStatus(request, id, kind, controller.signal);
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
      queryClient.setQueriesData<AdminUserPage>(
        { queryKey: adminUserKeys.lists(variables.actorId) },
        (page) => replaceInPage(page, updated),
      );
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.lists(variables.actorId) });
      finish({ tone: 'success', text: DIALOG_COPY[variables.action].success });
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
      if (kind === 'conflict' || kind === 'not-found') refreshFromServer(variables.actorId);
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

  function openDialog(kind: AdminUserAction) {
    if (submittingRef.current) return;
    setNotice(null);
    dialogOpenRef.current = true;
    setDialog(kind);
  }

  function closeDialog() {
    dialogOpenRef.current = false;
    setDialog(null);
  }

  function confirm() {
    if (!dialog || submittingRef.current) return;
    submittingRef.current = true;
    action.mutate({
      action: dialog,
      actorId,
      epoch: getSessionEpoch(),
      access: adminAccessGeneration(queryClient, actorId),
    });
  }

  async function recheck() {
    const epoch = getSessionEpoch();
    const result = await detail.refetch();
    if (getSessionEpoch() !== epoch) return;
    setNotice(
      result.isError
        ? { tone: 'error', text: ADMIN_MESSAGES.detailUnavailable, recheck: true }
        : { tone: 'success', text: 'Đã tải lại. Trạng thái bên dưới là trạng thái hiện tại.' },
    );
  }

  const back = (
    <Link className={styles.back} to={backTo}>
      ← Danh sách người dùng
    </Link>
  );

  if (forbidden || errorKind === 'forbidden') return <AdminForbidden />;
  if (errorKind === 'not-found') {
    return (
      <div className={styles.page}>
        {back}
        <section className={styles.panel} aria-labelledby="admin-user-missing">
          <h1 id="admin-user-missing" className={styles.title}>
            Không tìm thấy tài khoản
          </h1>
          <p className={styles.panelText}>Đường dẫn không đúng hoặc tài khoản không còn tồn tại.</p>
        </section>
      </div>
    );
  }

  const user = detail.data;
  if (!user) {
    if (detail.isError && errorKind !== 'session') {
      return (
        <div className={styles.page}>
          {back}
          <ErrorNote
            label={
              errorKind === 'unauthenticated'
                ? ADMIN_MESSAGES.unauthenticated
                : ADMIN_MESSAGES.detailUnavailable
            }
            onRetry={errorKind === 'unauthenticated' ? undefined : () => void detail.refetch()}
          />
        </div>
      );
    }
    return (
      <div className={styles.page}>
        {back}
        <Loading label="Đang tải thông tin tài khoản…" />
      </div>
    );
  }

  const available = userActionFor(user, actorId);
  const pendingAction = action.isPending ? action.variables?.action : undefined;
  const copy = dialog ? DIALOG_COPY[dialog] : null;

  return (
    <div className={styles.page}>
      {back}
      <header className={styles.detailHeader}>
        <p className={styles.eyebrow}>Tài khoản</p>
        <h1 className={`${styles.title} ${styles.detailTitle}`}>{user.email}</h1>
        <div className={styles.badges}>
          <StatusBadge status={user.status} />
          <RoleList roles={user.roles} />
          {user.id === actorId && <span className={styles.self}>Bạn</span>}
        </div>
      </header>

      {detail.isError && errorKind !== 'session' && (
        <ErrorNote label={ADMIN_MESSAGES.detailUnavailable} onRetry={() => void detail.refetch()} />
      )}

      {/* Vung status luon co san de trinh doc man hinh doc duoc noi dung moi; loi dung role=alert. */}
      <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
        <div role="status">
          {notice?.tone === 'success' && (
            <p className={styles.notice} data-tone="success">
              {notice.text}
            </p>
          )}
          {pendingAction && !dialog && (
            <p className={styles.pendingLine}>{DIALOG_COPY[pendingAction].pending}</p>
          )}
        </div>
        {notice && notice.tone !== 'success' && (
          <div className={styles.notice} data-tone={notice.tone} role="alert">
            <p>{notice.text}</p>
            {notice.recheck && (
              <button type="button" className={styles.secondary} onClick={() => void recheck()}>
                Kiểm tra lại trạng thái
              </button>
            )}
          </div>
        )}
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.panel} aria-labelledby="admin-user-info">
          <h2 id="admin-user-info" className={styles.panelTitle}>
            Thông tin
          </h2>
          <dl className={styles.facts}>
            <div>
              <dt>Mã tài khoản</dt>
              <dd className={styles.mono}>{user.id}</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>
                <StatusBadge status={user.status} />
              </dd>
            </div>
            <div>
              <dt>Vai</dt>
              <dd>
                <RoleList roles={user.roles} />
              </dd>
            </div>
            <div>
              <dt>Xác thực email</dt>
              <dd className={styles.numeric}>
                {user.emailVerifiedAt ? formatAdminDateTime(user.emailVerifiedAt) : 'Chưa xác thực'}
              </dd>
            </div>
            <div>
              <dt>Ngày tạo</dt>
              <dd className={styles.numeric}>{formatAdminDateTime(user.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.panel} aria-labelledby="admin-user-actions">
          <h2 id="admin-user-actions" className={styles.panelTitle}>
            Thao tác
          </h2>
          {available.kind === 'none' && (
            <p className={styles.panelText}>{ACTION_UNAVAILABLE_REASON[available.reason]}</p>
          )}
          {available.kind === 'lock' && (
            <>
              <p className={styles.panelText}>
                Khóa tài khoản sẽ đăng xuất người dùng khỏi mọi thiết bị và chặn đăng nhập cho tới
                khi được mở khóa.
              </p>
              <button
                type="button"
                ref={actionButtonRef}
                className={styles.dangerButton}
                aria-disabled={action.isPending}
                onClick={() => openDialog('lock')}
              >
                {pendingAction === 'lock' ? DIALOG_COPY.lock.pending : 'Khóa tài khoản'}
              </button>
            </>
          )}
          {available.kind === 'unlock' && (
            <>
              <p className={styles.panelText}>
                Mở khóa cho phép người dùng đăng nhập lại; các phiên cũ không được khôi phục.
              </p>
              <button
                type="button"
                ref={actionButtonRef}
                className={styles.primaryButton}
                aria-disabled={action.isPending}
                onClick={() => openDialog('unlock')}
              >
                {pendingAction === 'unlock' ? DIALOG_COPY.unlock.pending : 'Mở khóa tài khoản'}
              </button>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={copy !== null}
        title={copy?.title ?? ''}
        subject={user.email}
        impacts={copy?.impacts ?? []}
        confirmLabel={copy?.confirm ?? ''}
        pendingLabel={copy?.pending ?? ''}
        tone={copy?.tone ?? 'primary'}
        pending={action.isPending}
        onConfirm={confirm}
        onClose={closeDialog}
        returnFocusRef={actionButtonRef}
      />
    </div>
  );
}
