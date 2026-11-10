import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { formatDateTime, formatPrice, samePaginatedQuery } from '@/core';
import {
  AdminForbidden,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import { orderBadges } from '../types.js';
import {
  adminOrderErrorText,
  adminOrderKeys,
  type AdminOrderPage,
  gatewayLabel,
  listPath,
  ORDER_TABS,
  type OrderTab,
  orderTones,
  paymentLabels,
} from './admin-orders.api.js';
import styles from './AdminOrders.module.css';
import {
  normalizeOrderSearch,
  ORDER_QUERY_MAX,
  orderListPath,
  parseOrderListSearch,
} from './order-list-query.js';

/** /admin/orders: don moi khach theo tab trang thai, tim ma don/email, phan trang (ADR-038). */
export function AdminOrdersPage() {
  const { user, getSessionEpoch } = useAuth();
  return <AdminOrders key={`${user?.id}:${getSessionEpoch()}`} />;
}

function AdminOrders() {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const location = useLocation();
  const navigate = useNavigate();
  const { query, canonical } = parseOrderListSearch(location.search);
  const { tab, q, page } = query;
  const needsCanonical = location.search !== canonical;
  const [draft, setDraft] = useState(q);
  const [syncedNavigation, setSyncedNavigation] = useState(location.key);
  if (syncedNavigation !== location.key) {
    setSyncedNavigation(location.key);
    setDraft(q);
  }
  const key = adminOrderKeys.list(actorId, tab, q, page);
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminOrderPage>(listPath(tab, q, page), { signal })),
    enabled: Boolean(actorId) && !forbidden && !needsCanonical,
    placeholderData: (previous, previousQuery) =>
      previousQuery && samePaginatedQuery(previousQuery.queryKey, key) ? previous : undefined,
    retry: shouldRetryAdminQuery,
  });
  const update = (next: { tab?: OrderTab; q?: string; page?: number }) => {
    navigate(
      orderListPath({
        ...query,
        ...next,
        q: normalizeOrderSearch(next.q ?? q),
        page: next.page ?? 1,
      }),
    );
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() });
  };
  const data = result.data;
  if (forbidden) return <AdminForbidden />;
  if (needsCanonical) return <Navigate to={orderListPath(query)} replace />;
  const outOfRange = Boolean(
    data && !result.isPlaceholderData && data.items.length === 0 && page > 1,
  );
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Đơn hàng</h1>
          {data && <p className={styles.count}>{data.total} đơn</p>}
        </div>
        <p className={styles.description}>Theo dõi đơn và xử lý các bước vận hành.</p>
      </header>

      <nav className={styles.tabs} aria-label="Lọc theo trạng thái">
        {ORDER_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.tab}
            aria-pressed={tab === item.key}
            onClick={() => update({ tab: item.key, q })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className={styles.controls}>
        <form className={styles.searchForm} role="search" onSubmit={search}>
          <label className={styles.searchLabel} htmlFor="admin-order-q">
            Tìm mã đơn hoặc email khách
          </label>
          <div className={styles.searchRow}>
            <input
              id="admin-order-q"
              className={styles.searchInput}
              value={draft}
              maxLength={ORDER_QUERY_MAX}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Mã đơn hoặc email…"
            />
            <button type="submit" className={styles.searchButton}>
              Tìm
            </button>
            {q && (
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  setDraft('');
                  update({ q: '' });
                }}
              >
                Xóa tìm
              </button>
            )}
          </div>
        </form>
      </div>

      {result.isPending && <Loading label="Đang tải đơn hàng…" />}
      {result.isError && (
        <ErrorNote
          label={adminOrderErrorText(result.error, 'list')}
          onRetry={() => void result.refetch()}
        />
      )}
      {data && data.items.length === 0 && (
        <Empty
          label={
            outOfRange
              ? `Trang ${page} không có dữ liệu.`
              : tab === 'attention' && !q
                ? 'Không có đơn nào cần xử lý. Đơn cần đối soát, lệnh hoàn chưa chốt hoặc đơn hủy đã thu tiền sẽ hiện ở đây.'
                : 'Không có đơn khớp bộ lọc.'
          }
        />
      )}
      {data && outOfRange && (
        <Link
          className={styles.secondary}
          to={orderListPath({ ...query, page: Math.max(1, data.totalPages) })}
        >
          {data.totalPages > 0 ? 'Về trang cuối có dữ liệu' : 'Về trang đầu'}
        </Link>
      )}
      {data && data.items.length > 0 && (
        <div className={styles.tableWrap} aria-busy={result.isFetching}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Mã đơn</th>
                <th scope="col">Khách</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thanh toán</th>
                <th scope="col" className={styles.right}>
                  Tổng
                </th>
                <th scope="col">Đặt lúc</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id}>
                  <td data-label="Mã đơn">
                    <div>
                      <Link
                        className={styles.code}
                        to={{
                          pathname: `/admin/orders/${encodeURIComponent(order.id)}`,
                          search: canonical,
                        }}
                      >
                        {order.orderCode}
                      </Link>
                      <span className={styles.sub}>{order.itemCount} món</span>
                    </div>
                  </td>
                  <td data-label="Khách" className={styles.email}>
                    {order.customerEmail}
                  </td>
                  <td data-label="Trạng thái">
                    <div>
                      <span className={styles.badge} data-tone={orderTones[order.status]}>
                        <span className={styles.badgeDot} aria-hidden="true" />
                        {orderBadges[order.status] ?? order.status}
                      </span>
                      {order.refundPending && (
                        <span className={styles.flag}>Lệnh hoàn chờ chốt</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Thanh toán">
                    <div>
                      {gatewayLabel(order.gateway)}
                      <span className={styles.sub}>
                        {paymentLabels[order.paymentStatus ?? ''] ?? order.paymentStatus ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td data-label="Tổng" className={`${styles.right} ${styles.numeric}`}>
                    <div>
                      {formatPrice(order.totalAmount)}
                      {Number(order.refundedAmount) > 0 && (
                        <span className={styles.sub}>Hoàn {formatPrice(order.refundedAmount)}</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Đặt lúc" className={styles.numeric}>
                    {formatDateTime(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && !outOfRange && data.totalPages > 1 && (
        <Pager
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          unit="đơn"
          onChange={(next) => update({ page: next })}
        />
      )}
    </div>
  );
}
