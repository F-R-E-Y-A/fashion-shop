import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import { ADMIN_MESSAGES, classifyAdminError, shouldRetryAdminQuery } from './admin-errors.js';
import { formatAdminDate, formatCount, useAdminActor, useAdminForbidden } from './admin-hooks.js';
import { adminUserKeys, listAdminUsers } from './admin-users.api.js';
import { AdminForbidden } from './AdminForbidden.js';
import styles from './AdminUsers.module.css';
import { parsePageParam, usersListPath } from './page-param.js';
import { RoleList, StatusBadge } from './UserBadges.js';

export function AdminUsersPage() {
  const { actorId, request } = useAdminActor();
  const { forbidden, guardQuery } = useAdminForbidden(actorId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const parsed = parsePageParam(searchParams.get('page'));
  const page = parsed ?? 1;

  const users = useQuery({
    queryKey: adminUserKeys.list(actorId, page),
    queryFn: ({ signal }) => guardQuery(() => listAdminUsers(request, page, signal)),
    enabled: Boolean(actorId) && parsed !== undefined && !forbidden,
    retry: shouldRetryAdminQuery,
    // Giu trang cu khi chuyen trang, nhung chi khi cung actor: khong bao gio muon du lieu nguoi khac.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === actorId ? previous : undefined,
  });
  const errorKind = users.error ? classifyAdminError(users.error, 'list') : null;

  if (parsed === undefined) return <Navigate to={usersListPath(1)} replace />;
  if (forbidden || errorKind === 'forbidden') return <AdminForbidden />;

  const data = users.data;
  const totalLabel = data ? `${formatCount(data.total)} tài khoản` : null;

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
    if (data.total === 0) return <Empty label="Chưa có tài khoản nào." />;
    if (data.items.length === 0) {
      return (
        <div className={styles.emptyPage}>
          <Empty label={`Trang ${page} không có dữ liệu.`} />
          <Link className={styles.textLink} to={usersListPath(data.totalPages)}>
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
        <div className={styles.tableWrap} aria-busy={users.isPlaceholderData}>
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
              </tr>
            </thead>
            <tbody role="rowgroup">
              {data.items.map((item) => (
                <tr key={item.id} role="row">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          unit="tài khoản"
          onChange={(next) => setSearchParams(next > 1 ? { page: String(next) } : {})}
        />
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
      {renderBody()}
    </div>
  );
}
