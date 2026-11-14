import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { formatDateTime, formatPrice, samePaginatedQuery } from '@/core';
import {
  AdminForbidden,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import styles from './AdminReturns.module.css';
import {
  ADMIN_TABS,
  type AdminReturnFilters,
  type AdminReturnPage,
  adminReturnPath,
  type AdminReturnTab,
  REASON_LABELS,
  returnKeys,
  STATUS_LABELS,
  STATUS_TONES,
} from './returns.api.js';

function readFilters(params: URLSearchParams): AdminReturnFilters {
  const status = params.get('status');
  return {
    status: ADMIN_TABS.some((tab) => tab.value === status)
      ? (status as AdminReturnTab)
      : 'REQUESTED',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** /admin/returns: yeu cau cu nhat truoc, loc theo trang thai, mac dinh cho duyet (UC-14.2 buoc 1). */
export function AdminReturnsPage() {
  const { user, getSessionEpoch } = useAuth();
  return <AdminReturns key={`${user?.id}:${getSessionEpoch()}`} />;
}

function AdminReturns() {
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const key = returnKeys.adminList(actorId, filters);
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      guardQuery(() => authenticatedRequest<AdminReturnPage>(adminReturnPath(filters), { signal })),
    enabled: Boolean(actorId) && !forbidden,
    placeholderData: (previous, previousQuery) =>
      previousQuery && samePaginatedQuery(previousQuery.queryKey, key) ? previous : undefined,
    retry: shouldRetryAdminQuery,
  });
  const data = result.data;

  if (forbidden) return <AdminForbidden />;

  const update = (next: Partial<AdminReturnFilters>) => {
    const merged = { ...filters, page: 1, ...next };
    const out = new URLSearchParams();
    if (merged.status !== 'REQUESTED') out.set('status', merged.status);
    if (merged.page > 1) out.set('page', String(merged.page));
    setParams(out);
  };
  // Giu bo loc khi quay lai tu trang chi tiet.
  const search = params.toString() ? `?${params.toString()}` : '';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Trả hàng</h1>
          {data && <p className={styles.count}>{data.total} yêu cầu</p>}
        </div>
        <p className={styles.description}>
          Duyệt yêu cầu, ghi nhận hàng về kho và hoàn tiền cho khách.
        </p>
      </header>

      <nav className={styles.tabs} aria-label="Lọc theo trạng thái">
        {ADMIN_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={styles.tab}
            aria-pressed={filters.status === tab.value}
            onClick={() => update({ status: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {result.isPending && <Loading label="Đang tải yêu cầu trả hàng…" />}
      {result.isError && (
        <ErrorNote
          label="Không tải được yêu cầu trả hàng. Kiểm tra kết nối rồi thử lại."
          onRetry={() => void result.refetch()}
        />
      )}
      {data && data.items.length === 0 && (
        <Empty
          label={
            filters.status === 'REQUESTED'
              ? 'Không có yêu cầu nào chờ duyệt.'
              : 'Không có yêu cầu nào khớp bộ lọc.'
          }
        />
      )}
      {data && data.items.length > 0 && (
        <div className={styles.tableWrap} aria-busy={result.isFetching}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Gửi lúc</th>
                <th scope="col">Mã đơn</th>
                <th scope="col">Khách</th>
                <th scope="col">Lý do</th>
                <th scope="col" className={styles.right}>
                  Sản phẩm
                </th>
                <th scope="col" className={styles.right}>
                  Hoàn
                </th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Gửi lúc" className={styles.numeric}>
                    {formatDateTime(item.createdAt)}
                  </td>
                  <td data-label="Mã đơn">
                    <Link
                      className={styles.code}
                      to={{ pathname: `/admin/returns/${encodeURIComponent(item.id)}`, search }}
                    >
                      {item.orderCode}
                    </Link>
                  </td>
                  <td data-label="Khách" className={styles.email}>
                    {item.customerEmail}
                  </td>
                  <td data-label="Lý do">{REASON_LABELS[item.reasonCode]}</td>
                  <td data-label="Sản phẩm" className={`${styles.numeric} ${styles.right}`}>
                    {item.items.length}
                  </td>
                  <td data-label="Hoàn" className={`${styles.numeric} ${styles.right}`}>
                    {formatPrice(item.refundAmount)}
                  </td>
                  <td data-label="Trạng thái">
                    <span className={styles.badge} data-tone={STATUS_TONES[item.status]}>
                      <span className={styles.badgeDot} aria-hidden="true" />
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.totalPages > 1 && (
        <Pager
          page={filters.page}
          totalPages={data.totalPages}
          total={data.total}
          unit="yêu cầu"
          onChange={(page) => update({ page })}
        />
      )}
    </div>
  );
}
