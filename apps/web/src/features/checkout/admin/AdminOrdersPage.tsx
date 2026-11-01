import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { formatDateTime, formatPrice, shouldRetryRequest } from '@/core';
import { useAuth } from '@/features/account';
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

const isTab = (value: string | null): value is OrderTab =>
  ORDER_TABS.some((tab) => tab.key === value);

/** /admin/orders: don moi khach theo tab trang thai, tim ma don/email, phan trang (ADR-038). */
export function AdminOrdersPage() {
  const { user, authenticatedRequest: request } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: OrderTab = isTab(params.get('tab')) ? (params.get('tab') as OrderTab) : 'attention';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [draft, setDraft] = useState(q);
  const result = useQuery({
    queryKey: adminOrderKeys.list(user!.id, tab, q, page),
    queryFn: () => request<AdminOrderPage>(listPath(tab, q, page)),
    placeholderData: keepPreviousData,
    retry: shouldRetryRequest,
  });
  const update = (next: { tab?: OrderTab; q?: string; page?: number }) => {
    const merged = new URLSearchParams();
    merged.set('tab', next.tab ?? tab);
    const text = next.q ?? q;
    if (text) merged.set('q', text);
    const nextPage = next.page ?? 1;
    if (nextPage > 1) merged.set('page', String(nextPage));
    setParams(merged);
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim() });
  };
  const data = result.data;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Quản trị</p>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Đơn hàng</h1>
          {data && <p className={styles.count}>{data.total} đơn</p>}
        </div>
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
              maxLength={254}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="FR2610… hoặc khach@…"
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
            tab === 'attention' && !q
              ? 'Không có đơn nào cần xử lý. Đơn cần đối soát, lệnh hoàn chưa chốt hoặc đơn hủy đã thu tiền sẽ hiện ở đây.'
              : 'Không có đơn khớp bộ lọc.'
          }
        />
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
                      <Link className={styles.code} to={`/admin/orders/${order.id}`}>
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
      {data && data.totalPages > 1 && (
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
