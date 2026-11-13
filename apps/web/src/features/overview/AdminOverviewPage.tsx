import { Link } from 'react-router-dom';

import { AdminForbidden, formatAdminDateTime, formatCount, useAuth } from '@/features/account';
import { orderBadges } from '@/features/checkout';

import styles from './AdminOverview.module.css';
import { useAdminOverview } from './use-admin-overview.js';

export function AdminOverviewPage() {
  const { user, getSessionEpoch } = useAuth();
  return <AdminOverview key={`${user?.id}:${getSessionEpoch()}`} />;
}

function AdminOverview() {
  const { user, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, isRefreshing, refetchAll, users, products, orders, attention, lowStock } =
    useAdminOverview(actorId, getSessionEpoch);

  if (forbidden) return <AdminForbidden />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Tổng quan cửa hàng</h1>
          <p className={styles.subtitle}>Số liệu hiện tại · cập nhật theo từng khối</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={refetchAll}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            {isRefreshing ? 'Đang làm mới…' : 'Làm mới'}
          </button>
        </div>
      </header>

      <section className={styles.kpiGrid} aria-label="Chỉ số hoạt động chính">
        <KpiCard
          label="Người dùng"
          href="/admin/users"
          total={users.data?.total}
          isLoading={users.isLoading}
          isError={users.isError}
          isRefetching={users.isRefetching}
          onRetry={() => users.refetch()}
        />
        <KpiCard
          label="Sản phẩm"
          href="/admin/products"
          total={products.data?.total}
          isLoading={products.isLoading}
          isError={products.isError}
          isRefetching={products.isRefetching}
          onRetry={() => products.refetch()}
        />
        <KpiCard
          label="Đơn hàng"
          href="/admin/orders?tab=all"
          total={orders.data?.total}
          isLoading={orders.isLoading}
          isError={orders.isError}
          isRefetching={orders.isRefetching}
          onRetry={() => orders.refetch()}
        />
        <KpiCard
          label="Cần xử lý"
          href="/admin/orders?tab=attention"
          total={attention.data?.total}
          isLoading={attention.isLoading}
          isError={attention.isError}
          isRefetching={attention.isRefetching}
          onRetry={() => attention.refetch()}
        />
      </section>

      {/* Attention Orders Panel */}
      <section className={styles.panel} aria-labelledby="attention-heading">
        <div className={styles.panelHeader}>
          <div className={styles.panelHeadingGroup}>
            <div className={styles.panelTitleRow}>
              <h2 id="attention-heading" className={styles.panelTitle}>
                Đơn cần đối soát/xử lý
              </h2>
              {attention.data !== undefined && (
                <span className={styles.badge}>{formatCount(attention.data.total)}</span>
              )}
            </div>
          </div>
        </div>

        {attention.isLoading ? (
          <div className={styles.emptyState} role="status">
            Đang tải đơn cần xử lý…
          </div>
        ) : attention.isError ? (
          <div className={styles.errorState} role="alert">
            <span>Không tải được đơn cần xử lý.</span>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => attention.refetch()}
              disabled={attention.isRefetching}
            >
              {attention.isRefetching ? 'Đang thử lại…' : 'Thử lại'}
            </button>
          </div>
        ) : attention.data?.items.length === 0 ? (
          <div className={styles.emptyState}>Không có đơn hàng cần xử lý.</div>
        ) : (
          <>
            <div className={styles.desktopView}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Mã đơn</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col">Ngày tạo</th>
                      <th scope="col">Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.data?.items.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <Link to={`/admin/orders/${order.id}`} className={styles.actionLink}>
                            {order.orderCode}
                          </Link>
                        </td>
                        <td>
                          <span className={styles.badge}>
                            {orderBadges[order.status] ?? order.status}
                          </span>
                        </td>
                        <td className={styles.numeric}>{formatAdminDateTime(order.createdAt)}</td>
                        <td>
                          <Link to={`/admin/orders/${order.id}`} className={styles.actionLink}>
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.mobileView}>
              <div className={styles.mobileCardList}>
                {attention.data?.items.map((order) => (
                  <div key={order.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardHeader}>
                      <span className={styles.mobileCardTitle}>{order.orderCode}</span>
                      <span className={styles.badge}>
                        {orderBadges[order.status] ?? order.status}
                      </span>
                    </div>
                    <div className={styles.mobileCardMeta}>
                      Ngày tạo: {formatAdminDateTime(order.createdAt)}
                    </div>
                    <div className={styles.mobileCardAction}>
                      <Link to={`/admin/orders/${order.id}`} className={styles.actionLink}>
                        Chi tiết
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className={styles.panelFooter}>
          <Link to="/admin/orders?tab=attention" className={styles.footerLink}>
            Mở danh sách
          </Link>
        </div>
      </section>

      {/* Low Stock Panel */}
      <section className={styles.panel} aria-labelledby="low-stock-heading">
        <div className={styles.panelHeader}>
          <div className={styles.panelHeadingGroup}>
            <div className={styles.panelTitleRow}>
              <h2 id="low-stock-heading" className={styles.panelTitle}>
                Tồn thấp
              </h2>
              {lowStock.data !== undefined && (
                <span className={styles.badge}>{formatCount(lowStock.data.total)}</span>
              )}
            </div>
            <p className={styles.panelSubtitle}>Khả dụng từ 0 đến 5, gồm biến thể ngừng bán</p>
          </div>
        </div>

        {lowStock.isLoading ? (
          <div className={styles.emptyState} role="status">
            Đang tải tồn kho thấp…
          </div>
        ) : lowStock.isError ? (
          <div className={styles.errorState} role="alert">
            <span>Không tải được dữ liệu tồn thấp.</span>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => lowStock.refetch()}
              disabled={lowStock.isRefetching}
            >
              {lowStock.isRefetching ? 'Đang thử lại…' : 'Thử lại'}
            </button>
          </div>
        ) : lowStock.data?.items.length === 0 ? (
          <div className={styles.emptyState}>Không có biến thể tồn thấp.</div>
        ) : (
          <>
            <div className={styles.desktopView}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Sản phẩm / cỡ / màu</th>
                      <th scope="col">Khả dụng</th>
                      <th scope="col">Xem kho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.data?.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link to={`/admin/inventory/${item.id}`} className={styles.actionLink}>
                            {item.sku}
                          </Link>
                        </td>
                        <td>
                          {item.productName} · {item.colorName} / {item.sizeCode}
                        </td>
                        <td className={styles.numeric}>{item.availableQuantity}</td>
                        <td>
                          <Link to={`/admin/inventory/${item.id}`} className={styles.actionLink}>
                            Xem kho
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.mobileView}>
              <div className={styles.mobileCardList}>
                {lowStock.data?.items.map((item) => (
                  <div key={item.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardHeader}>
                      <span className={styles.mobileCardTitle}>{item.sku}</span>
                      <span className={styles.badge}>Khả dụng: {item.availableQuantity}</span>
                    </div>
                    <div className={styles.mobileCardMeta}>
                      {item.productName} · {item.colorName} / {item.sizeCode}
                    </div>
                    <div className={styles.mobileCardAction}>
                      <Link to={`/admin/inventory/${item.id}`} className={styles.actionLink}>
                        Xem kho
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className={styles.panelFooter}>
          <Link to="/admin/inventory" className={styles.footerLink}>
            Mở tồn kho
          </Link>
        </div>
      </section>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  href: string;
  total?: number;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  onRetry: () => void;
}

function KpiCard({ label, href, total, isLoading, isError, isRefetching, onRetry }: KpiCardProps) {
  if (isError) {
    return (
      <div className={styles.kpiCard}>
        <div className={styles.kpiCardHeader}>
          <span className={styles.kpiLabel}>{label}</span>
          <Link to={href} className={styles.kpiLink} aria-label={`Mở danh sách ${label}`}>
            Mở trang
          </Link>
        </div>
        <div className={styles.kpiError} role="alert">
          <span>— Không tải được</span>
          <button
            type="button"
            className={styles.kpiRetryBtn}
            onClick={onRetry}
            disabled={isRefetching}
            aria-label={`Thử lại tải ${label}`}
          >
            {isRefetching ? 'Đang thử lại…' : 'Thử lại'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Link to={href} className={styles.kpiCard}>
      <span className={styles.kpiLabel}>{label}</span>
      {isLoading ? (
        <span className={styles.kpiLoading} role="status">
          Đang tải…
        </span>
      ) : (
        <span className={styles.kpiValue}>{total !== undefined ? formatCount(total) : '—'}</span>
      )}
    </Link>
  );
}
