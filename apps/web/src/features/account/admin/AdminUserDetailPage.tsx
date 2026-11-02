import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ConfirmDialog, ErrorNote, Loading } from '@/ui';

import { ADMIN_MESSAGES, classifyAdminError, shouldRetryAdminQuery } from './admin-errors.js';
import { formatAdminDateTime, useAdminActor, useAdminForbidden } from './admin-hooks.js';
import { adminUserKeys, getAdminUser } from './admin-users.api.js';
import { AdminForbidden } from './AdminForbidden.js';
import styles from './AdminUsers.module.css';
import { readListReturn } from './list-query.js';
import { ACTION_UNAVAILABLE_REASON, userActionFor } from './user-labels.js';
import {
  STATUS_ACTION_COPY,
  StatusActionNotice,
  useUserStatusAction,
} from './user-status-action.js';
import { RoleList, StatusBadge } from './UserBadges.js';

export function AdminUserDetailPage() {
  const { actorId, getSessionEpoch } = useAdminActor();
  const { id = '' } = useParams();
  return <AdminUserDetail key={`${actorId}:${getSessionEpoch()}:${id}`} />;
}

function AdminUserDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const backTo = readListReturn(location.state);
  const { actorId, request, getSessionEpoch } = useAdminActor();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const action = useUserStatusAction({ actorId, markForbidden });

  const detail = useQuery({
    queryKey: adminUserKeys.detail(actorId, id),
    queryFn: ({ signal }) => guardQuery(() => getAdminUser(request, id, signal)),
    enabled: Boolean(actorId) && !forbidden,
    retry: shouldRetryAdminQuery,
  });
  const errorKind = detail.error ? classifyAdminError(detail.error, 'detail') : null;

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
  const pendingAction =
    action.pendingTarget?.id === user.id ? action.pendingTarget.action : undefined;

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

      <StatusActionNotice action={action} />

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
                className={styles.dangerButton}
                aria-disabled={action.busy}
                onClick={(event) =>
                  action.open(
                    { id: user.id, email: user.email, action: 'lock' },
                    event.currentTarget,
                  )
                }
              >
                {pendingAction === 'lock' ? STATUS_ACTION_COPY.lock.pending : 'Khóa tài khoản'}
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
                className={styles.primaryButton}
                aria-disabled={action.busy}
                onClick={(event) =>
                  action.open(
                    { id: user.id, email: user.email, action: 'unlock' },
                    event.currentTarget,
                  )
                }
              >
                {pendingAction === 'unlock'
                  ? STATUS_ACTION_COPY.unlock.pending
                  : 'Mở khóa tài khoản'}
              </button>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog {...action.dialogProps} />
    </div>
  );
}
