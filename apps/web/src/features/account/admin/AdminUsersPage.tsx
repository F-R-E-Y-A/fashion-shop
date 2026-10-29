import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import { ADMIN_MESSAGES, classifyAdminError, shouldRetryAdminQuery } from './admin-errors.js';
import { formatAdminDate, formatCount, useAdminActor, useAdminForbidden } from './admin-hooks.js';
import { type AdminUser, adminUserKeys, listAdminUsers } from './admin-users.api.js';
import { AdminForbidden } from './AdminForbidden.js';
import styles from './AdminUsers.module.css';
import { ConfirmDialog } from './ConfirmDialog.js';
import {
  DEFAULT_USER_LIST_QUERY,
  hasUserListFilters,
  matchesUserListFilter,
  normalizeUserQueryText,
  parseUserListSearch,
  serializeUserListQuery,
  USER_PAGE_SIZES,
  type UserListQuery,
  userListSignature,
  usersListPath,
} from './list-query.js';
import { ACTION_UNAVAILABLE_REASON, userActionFor } from './user-labels.js';
import {
  STATUS_ACTION_COPY,
  StatusActionNotice,
  type UserStatusActionState,
  useUserStatusAction,
} from './user-status-action.js';
import { RoleList, StatusBadge } from './UserBadges.js';
import { UserListControls } from './UserListControls.js';

/** O thao tac nhanh cua mot dong: cung luong voi trang chi tiet (useUserStatusAction). */
function RowAction({
  item,
  actorId,
  leaving,
  action,
}: {
  item: AdminUser;
  actorId: string;
  leaving: boolean;
  action: UserStatusActionState;
}) {
  if (leaving) return <span className={styles.leavingNote}>Không còn khớp bộ lọc</span>;
  const available = userActionFor(item, actorId);
  if (available.kind === 'none') {
    return (
      <>
        <span className={styles.muted} aria-hidden="true">
          —
        </span>
        <span className="sr-only">{ACTION_UNAVAILABLE_REASON[available.reason]}</span>
      </>
    );
  }
  const kind = available.kind;
  const pending = action.pendingTarget?.id === item.id;
  const label = kind === 'lock' ? 'Khóa' : 'Mở khóa';
  return (
    <button
      type="button"
      className={kind === 'lock' ? styles.rowDanger : styles.rowPrimary}
      aria-label={`${label} tài khoản ${item.email}`}
      aria-disabled={action.busy}
      onClick={(event) =>
        action.open({ id: item.id, email: item.email, action: kind }, event.currentTarget)
      }
    >
      {pending ? STATUS_ACTION_COPY[kind].pending : label}
    </button>
  );
}

export function AdminUsersPage() {
  const { actorId, request } = useAdminActor();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId);
  const action = useUserStatusAction({ actorId, markForbidden });
  const location = useLocation();
  const navigate = useNavigate();
  const { query, canonical } = parseUserListSearch(location.search);
  // Một bản nháp dùng chung cho ô tìm, phân trang và số dòng: điều khiển ngoài thanh lọc
  // cũng phải mang theo chữ đang gõ trước khi debounce kịp cập nhật URL.
  const [draft, setDraft] = useState(query.q);
  const [syncedNavigation, setSyncedNavigation] = useState(location.key);
  if (syncedNavigation !== location.key) {
    setSyncedNavigation(location.key);
    setDraft(query.q);
  }
  const needsCanonical = canonical !== location.search;
  const signature = userListSignature(query);
  const filtered = hasUserListFilters(query);

  const users = useQuery({
    queryKey: adminUserKeys.list(actorId, query),
    queryFn: ({ signal }) => guardQuery(() => listAdminUsers(request, query, signal)),
    enabled: Boolean(actorId) && !needsCanonical && !forbidden,
    retry: shouldRetryAdminQuery,
    // Giu trang cu CHI khi cung actor va cung dieu kien, chi khac trang: doi bo loc thi hien dang tai,
    // khong de tap cu nhay duoi bo loc moi; khong bao gio muon du lieu cua actor khac.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === actorId && previousQuery.queryKey[3] === signature
        ? previous
        : undefined,
  });
  const errorKind = users.error ? classifyAdminError(users.error, 'list') : null;

  const go = (next: UserListQuery, options: { replace: boolean }) =>
    navigate(
      { pathname: '/admin/users', search: serializeUserListQuery(next) },
      { replace: options.replace },
    );
  const clearFilters = () =>
    go(
      { ...DEFAULT_USER_LIST_QUERY, sort: query.sort, pageSize: query.pageSize },
      { replace: false },
    );

  if (needsCanonical)
    return <Navigate to={{ pathname: '/admin/users', search: canonical }} replace />;
  if (forbidden || errorKind === 'forbidden') return <AdminForbidden />;

  const data = users.data;
  const totalLabel = data
    ? `${formatCount(data.total)} tài khoản${filtered ? ' phù hợp' : ''}`
    : null;

  function renderBody() {
    if (!data) {
      if (errorKind === 'session' || (users.isPending && !users.isError)) {
        return <Loading label="Đang tải danh sách người dùng…" />;
      }
      if (errorKind === 'unauthenticated')
        return <ErrorNote label={ADMIN_MESSAGES.unauthenticated} />;
      return (
        <ErrorNote
          label={
            errorKind === 'invalid' ? ADMIN_MESSAGES.listInvalid : ADMIN_MESSAGES.listUnavailable
          }
          onRetry={() => void users.refetch()}
        />
      );
    }
    if (data.total === 0 && filtered) {
      return (
        <div className={styles.emptyPage}>
          <Empty label="Không có tài khoản phù hợp với bộ lọc." />
          <button type="button" className={styles.clearButton} onClick={clearFilters}>
            Xóa bộ lọc
          </button>
        </div>
      );
    }
    if (data.total === 0) return <Empty label="Chưa có tài khoản nào." />;
    if (data.items.length === 0) {
      // Khong tu chuyen trang: tranh vong lap khi total doi; dua duong ve trang hop le cuoi cung.
      return (
        <div className={styles.emptyPage}>
          <Empty label={`Trang ${query.page} không có dữ liệu.`} />
          <Link className={styles.textLink} to={usersListPath({ ...query, page: data.totalPages })}>
            Về trang {data.totalPages}
          </Link>
        </div>
      );
    }

    return (
      <>
        {users.isError && (
          <ErrorNote label={ADMIN_MESSAGES.listUnavailable} onRetry={() => void users.refetch()} />
        )}
        <div className={styles.tableWrap} aria-busy={users.isPlaceholderData || users.isFetching}>
          <table className={styles.table} role="table">
            <caption className="sr-only">
              Danh sách tài khoản, trang {data.page} trên {data.totalPages}
            </caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  Email
                </th>
                <th role="columnheader" scope="col">
                  Vai
                </th>
                <th role="columnheader" scope="col">
                  Trạng thái
                </th>
                <th role="columnheader" scope="col">
                  Xác thực email
                </th>
                <th role="columnheader" scope="col">
                  Ngày tạo
                </th>
                <th role="columnheader" scope="col">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {data.items.map((item) => {
                const leaving = !matchesUserListFilter(item, query);
                return (
                  <tr key={item.id} role="row" data-leaving={leaving || undefined}>
                    <td role="cell" className={styles.emailCell}>
                      <Link
                        className={styles.emailLink}
                        to={`/admin/users/${encodeURIComponent(item.id)}`}
                        state={{ listSearch: location.search }}
                      >
                        {item.email}
                      </Link>
                      {item.id === actorId && <span className={styles.self}>Bạn</span>}
                    </td>
                    <td role="cell" data-label="Vai">
                      <RoleList roles={item.roles} />
                    </td>
                    <td role="cell" data-label="Trạng thái">
                      <StatusBadge status={item.status} />
                    </td>
                    <td role="cell" data-label="Xác thực email" className={styles.numeric}>
                      {item.emailVerifiedAt ? (
                        formatAdminDate(item.emailVerifiedAt)
                      ) : (
                        <span className={styles.muted}>Chưa xác thực</span>
                      )}
                    </td>
                    <td role="cell" data-label="Ngày tạo" className={styles.numeric}>
                      {formatAdminDate(item.createdAt)}
                    </td>
                    <td role="cell" data-label="Thao tác" className={styles.actionCell}>
                      <RowAction item={item} actorId={actorId} leaving={leaving} action={action} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={styles.listFooter}>
          <Pager
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="tài khoản"
            onChange={(page) =>
              go(
                {
                  ...query,
                  q: normalizeUserQueryText(draft),
                  page: normalizeUserQueryText(draft) === query.q ? page : 1,
                },
                { replace: false },
              )
            }
          />
          <label className={styles.pageSize}>
            <span>Số dòng</span>
            <select
              value={query.pageSize}
              onChange={(event) =>
                go(
                  {
                    ...query,
                    q: normalizeUserQueryText(draft),
                    pageSize: Number(event.target.value) as UserListQuery['pageSize'],
                    page: 1,
                  },
                  { replace: false },
                )
              }
            >
              {USER_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Quản trị</p>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Người dùng</h1>
          {totalLabel && <p className={styles.count}>{totalLabel}</p>}
        </div>
      </header>
      <UserListControls
        navigationKey={location.key}
        query={query}
        draft={draft}
        setDraft={setDraft}
        onNavigate={go}
      />
      <StatusActionNotice action={action} />
      {users.isFetching && data && !users.isPlaceholderData && (
        <p className={styles.refreshing} role="status">
          Đang cập nhật danh sách…
        </p>
      )}
      {renderBody()}
      <ConfirmDialog {...action.dialogProps} />
    </div>
  );
}
