import { type FormEvent, useState, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AdminForbidden, formatAdminDateTime } from '@/features/account';

import {
  buildReportSearchParams,
  getDaysDifference,
  isValidCalendarDate,
  parseReportQueryParams,
} from './admin-reporting-query';
import styles from './AdminReports.module.css';
import { reportError, useAdminReports } from './use-admin-reports';

export function formatVnd(amount: string | number): string {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (isNaN(num)) return '0 đ';
  return `${num.toLocaleString('vi-VN')} đ`;
}

const ORDER_STATUS_LABELS: Record<
  string,
  { label: string; tone?: 'accent' | 'danger' | 'pending' | 'muted' }
> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', tone: 'pending' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'pending' },
  CONFIRMED: { label: 'Đã xác nhận', tone: 'accent' },
  PROCESSING: { label: 'Đang chuẩn bị hàng', tone: 'accent' },
  SHIPPING: { label: 'Đang giao hàng', tone: 'accent' },
  DELIVERED: { label: 'Đã giao hàng', tone: 'accent' },
  CANCELLED: { label: 'Đã hủy', tone: 'danger' },
  RETURNED: { label: 'Đã trả hàng', tone: 'muted' },
};

export function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, startTransition] = useTransition();

  const queryParams = parseReportQueryParams(searchParams);

  // Form input local state
  const [draftFrom, setDraftFrom] = useState(queryParams.from);
  const [draftTo, setDraftTo] = useState(queryParams.to);
  const [draftTop, setDraftTop] = useState<5 | 10 | 20>(queryParams.top);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // Synced with URL
  const { query, forbidden, data } = useAdminReports(queryParams);

  if (forbidden) return <AdminForbidden />;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!isValidCalendarDate(draftFrom)) {
      setValidationError('Ngày bắt đầu không hợp lệ (định dạng YYYY-MM-DD).');
      return;
    }
    if (!isValidCalendarDate(draftTo)) {
      setValidationError('Ngày kết thúc không hợp lệ (định dạng YYYY-MM-DD).');
      return;
    }
    if (draftFrom > draftTo) {
      setValidationError('Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.');
      return;
    }
    const diff = getDaysDifference(draftFrom, draftTo);
    if (diff > 366) {
      setValidationError('Khoảng thời gian tối đa được tra cứu là 366 ngày.');
      return;
    }

    startTransition(() => {
      setSearchParams(
        buildReportSearchParams({
          from: draftFrom,
          to: draftTo,
          top: draftTop,
        }),
      );
    });
  };

  const handleRefresh = () => {
    void query.refetch();
  };

  const isStale =
    data?.metadata?.lastCompletedAt &&
    now - new Date(data.metadata.lastCompletedAt).getTime() > 10 * 60 * 1000;

  const isNetNegative =
    data?.summary?.netRevenueAmount && Number(data.summary.netRevenueAmount) < 0;

  const dailyMoneyList = data?.dailyMoney ?? [];
  const ordersByStatusList = data?.ordersByStatus ?? [];
  const topProductsList = data?.topDeliveredProducts ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingRow}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>Báo cáo bán hàng</h1>
            <p className={styles.subtitle}>
              Tổng hợp số liệu thu/hoàn tiền và phân tích đơn hàng theo snapshot định kỳ
            </p>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <form
        className={styles.filterCard}
        onSubmit={handleSubmit}
        role="search"
        aria-label="Bộ lọc báo cáo"
      >
        <div className={styles.filterGroup}>
          <label htmlFor="report-from" className={styles.filterLabel}>
            Từ ngày
          </label>
          <input
            id="report-from"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className={styles.filterInput}
            required
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="report-to" className={styles.filterLabel}>
            Đến ngày
          </label>
          <input
            id="report-to"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className={styles.filterInput}
            required
          />
        </div>

        <div className={styles.filterGroup}>
          <label htmlFor="report-top" className={styles.filterLabel}>
            Top sản phẩm
          </label>
          <select
            id="report-top"
            value={draftTop}
            onChange={(e) => setDraftTop(Number(e.target.value) as 5 | 10 | 20)}
            className={styles.filterSelect}
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
          </select>
        </div>

        <div className={styles.filterActions}>
          <button type="submit" className={styles.applyButton}>
            Áp dụng
          </button>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={query.isFetching}
          >
            {query.isFetching ? 'Đang tải…' : 'Làm mới'}
          </button>
        </div>
      </form>

      {validationError && (
        <div className={styles.errorBanner} role="alert">
          <span>{validationError}</span>
        </div>
      )}

      {/* Snapshot Metadata & Status Indicator */}
      {data && (
        <div className={styles.statusMetaBar} aria-label="Thông tin trạng thái snapshot">
          {data.status === 'READY' ? (
            <span className={`${styles.metaPill} ${styles.metaPillReady}`}>
              ● Sẵn sàng (Snapshot v{data.metadata?.snapshotVersion ?? '1'})
            </span>
          ) : (
            <span className={`${styles.metaPill} ${styles.metaPillNotReady}`}>
              ▲ Chưa tổng hợp snapshot
            </span>
          )}

          {isStale && (
            <span className={`${styles.metaPill} ${styles.metaPillStale}`}>
              ⚠ Dữ liệu có thể đã cũ (&gt;10 phút)
            </span>
          )}

          {data.metadata?.lastCompletedAt && (
            <span>Cập nhật lúc: {formatAdminDateTime(data.metadata.lastCompletedAt)}</span>
          )}
        </div>
      )}

      {/* Error state */}
      {query.isError && (
        <div className={styles.errorBanner} role="alert">
          <span>{reportError(query.error)}</span>
          <button type="button" className={styles.retryButton} onClick={handleRefresh}>
            Thử lại
          </button>
        </div>
      )}

      {/* Loading state */}
      {query.isLoading && (
        <div className={styles.emptyState} role="status">
          Đang tải dữ liệu báo cáo…
        </div>
      )}

      {/* Main Content when data ready */}
      {data && (
        <>
          {/* 3 KPI Cards */}
          <section className={styles.kpiGrid} aria-label="Chỉ số doanh thu chính">
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Tiền đã thu</span>
              <p className={styles.kpiValue} data-testid="kpi-collected">
                {formatVnd(data.summary?.totalCollectedAmount ?? '0.00')}
              </p>
              <span className={styles.kpiHint}>
                COD đã giao và thanh toán trực tuyến thành công
              </span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Tiền đã hoàn</span>
              <p className={styles.kpiValue} data-testid="kpi-refunded">
                {formatVnd(data.summary?.totalRefundedAmount ?? '0.00')}
              </p>
              <span className={styles.kpiHint}>Giao dịch hoàn tiền thành công trong kỳ</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Thu ròng</span>
              <p
                className={`${styles.kpiValue} ${isNetNegative ? styles.kpiValueNegative : ''}`}
                data-testid="kpi-net"
              >
                {formatVnd(data.summary?.netRevenueAmount ?? '0.00')}
              </p>
              <span className={styles.kpiHint}>Tiền đã thu trừ đi tiền đã hoàn</span>
            </div>
          </section>

          {/* Section Tables */}
          <div className={styles.sectionGrid}>
            {/* Table 1: Daily Revenue */}
            <section className={styles.panel} aria-labelledby="daily-money-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="daily-money-heading" className={styles.panelTitle}>
                    Doanh thu theo ngày
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Chi tiết dòng tiền đã thu, đã hoàn và thu ròng phát sinh mỗi ngày
                  </p>
                </div>
              </div>

              {dailyMoneyList.length === 0 ? (
                <div className={styles.emptyState}>
                  Không có phát sinh doanh thu trong khoảng ngày này.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.responsiveTable}`}>
                    <thead>
                      <tr>
                        <th scope="col">Ngày</th>
                        <th scope="col" className={styles.numCell}>
                          Tiền đã thu
                        </th>
                        <th scope="col" className={styles.numCell}>
                          Tiền đã hoàn
                        </th>
                        <th scope="col" className={styles.numCell}>
                          Thu ròng
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyMoneyList.map((row) => (
                        <tr key={row.date}>
                          <td data-label="Ngày">{row.date}</td>
                          <td data-label="Tiền đã thu" className={styles.numCell}>
                            {formatVnd(row.collectedAmount)}
                          </td>
                          <td data-label="Tiền đã hoàn" className={styles.numCell}>
                            {formatVnd(row.refundedAmount)}
                          </td>
                          <td
                            data-label="Thu ròng"
                            className={`${styles.numCell} ${Number(row.netAmount) < 0 ? styles.kpiValueNegative : ''}`}
                          >
                            {formatVnd(row.netAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Table 2: Orders by Current Status */}
            <section className={styles.panel} aria-labelledby="orders-status-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="orders-status-heading" className={styles.panelTitle}>
                    Đơn hàng theo trạng thái hiện tại
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Các đơn đặt trong kỳ được phân loại theo trạng thái ghi nhận tại thời điểm
                    snapshot
                  </p>
                </div>
              </div>

              {ordersByStatusList.length === 0 ? (
                <div className={styles.emptyState}>
                  Chưa có đơn hàng nào được tạo trong khoảng ngày này.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.responsiveTable}`}>
                    <thead>
                      <tr>
                        <th scope="col">Trạng thái</th>
                        <th scope="col" className={styles.numCell}>
                          Số lượng đơn
                        </th>
                        <th scope="col" className={styles.numCell}>
                          Tỷ lệ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersByStatusList.map((row) => {
                        const statusConfig = ORDER_STATUS_LABELS[row.status] ?? {
                          label: row.status,
                          tone: 'muted' as const,
                        };
                        const displayLabel = row.label || statusConfig.label;
                        const displayCount = row.count ?? row.orderCount ?? 0;
                        return (
                          <tr key={row.status}>
                            <td data-label="Trạng thái">
                              <span className={styles.badge} data-tone={statusConfig.tone}>
                                {displayLabel}
                              </span>
                            </td>
                            <td data-label="Số lượng đơn" className={styles.numCell}>
                              {displayCount.toLocaleString('vi-VN')}
                            </td>
                            <td data-label="Tỷ lệ" className={styles.numCell}>
                              <span>{row.percentage}%</span>
                              <div className={styles.progressBarTrack}>
                                <div
                                  className={styles.progressBarFill}
                                  style={{
                                    width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                                  }}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Table 3: Top Delivered Products */}
            <section className={styles.panel} aria-labelledby="top-products-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="top-products-heading" className={styles.panelTitle}>
                    Top {queryParams.top} sản phẩm đã giao thành công
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Sản phẩm trong đơn được giao đến tay khách hàng (DELIVERED) trong kỳ
                  </p>
                </div>
              </div>

              {topProductsList.length === 0 ? (
                <div className={styles.emptyState}>
                  Chưa có sản phẩm nào được giao thành công trong khoảng ngày này.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={`${styles.table} ${styles.responsiveTable}`}>
                    <thead>
                      <tr>
                        <th scope="col" style={{ width: '60px' }}>
                          Hạng
                        </th>
                        <th scope="col">Tên sản phẩm</th>
                        <th scope="col" className={styles.numCell}>
                          Số lượng đã giao
                        </th>
                        <th scope="col" className={styles.numCell}>
                          Doanh thu giao
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProductsList.map((p, index) => (
                        <tr key={p.productId}>
                          <td data-label="Hạng">#{index + 1}</td>
                          <td data-label="Tên sản phẩm">{p.productName}</td>
                          <td data-label="Số lượng đã giao" className={styles.numCell}>
                            {p.deliveredQuantity.toLocaleString('vi-VN')}
                          </td>
                          <td data-label="Doanh thu giao" className={styles.numCell}>
                            {formatVnd(p.deliveredRevenueAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
