import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { AdminForbidden } from '@/features/account';
import { Loading } from '@/ui';

import {
  formatCurrencyVnd,
  formatDisplayDateTime,
  isComplexPromotion,
  promotionErrorText,
} from './admin-promotions.api.js';
import styles from './AdminPromotions.module.css';
import { usePromotionStatusAction } from './promotion-status-action.js';
import { useAdminPromotions } from './use-admin-promotions.js';

export function AdminPromotionsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawPage = searchParams.get('page');
  const rawPageSize = searchParams.get('pageSize');

  const isInvalidPage = rawPage !== null && !/^[1-9]\d*$/.test(rawPage);
  const page = !isInvalidPage && rawPage ? Number(rawPage) : 1;
  const pageSize = rawPageSize && /^[1-9]\d*$/.test(rawPageSize) ? Number(rawPageSize) : 12;

  const returnToParam = `?returnTo=${encodeURIComponent(location.pathname + location.search)}`;

  const { data, forbidden, isLoading, error, refetch } = useAdminPromotions(page, pageSize);
  const statusAction = usePromotionStatusAction(() => {
    void refetch();
  });

  const setPage = (nextPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  };

  // Chuẩn hóa URL nếu có tham số không hợp lệ mà không gọi setState trong render
  if (isInvalidPage) {
    const next = new URLSearchParams(searchParams);
    next.set('page', '1');
    return (
      <Navigate
        to={{
          pathname: location.pathname,
          search: next.toString() ? `?${next.toString()}` : '',
        }}
        replace
      />
    );
  }

  if (forbidden) {
    return <AdminForbidden />;
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>Chương trình khuyến mãi</h1>
          <p className={styles.subtitle}>
            Quản trị các chiến dịch ưu đãi đơn giản và theo dõi cấu hình nâng cao
          </p>
        </div>
        <Link
          to={`/admin/promotions/new${returnToParam}`}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          + Tạo chiến dịch
        </Link>
      </header>

      {statusAction.notice && (
        <div
          role="status"
          className={`${styles.banner} ${statusAction.notice.error ? styles.bannerError : styles.bannerSuccess}`}
        >
          <div className={styles.bannerTitle}>
            {statusAction.notice.error ? 'Lỗi' : 'Thành công'}
          </div>
          <div>{statusAction.notice.text}</div>
        </div>
      )}

      {isLoading && (
        <div className={styles.emptyState}>
          <Loading />
          <p>Đang tải danh sách chiến dịch...</p>
        </div>
      )}

      {Boolean(error) && !isLoading && (
        <div role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          <div className={styles.bannerTitle}>Không thể tải danh sách</div>
          <div>{promotionErrorText(error)}</div>
          <div className={styles.bannerActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSecondary}`}
              onClick={() => void refetch()}
            >
              Thử lại
            </button>
          </div>
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className={styles.emptyState}>
          <h2 className={styles.emptyTitle}>Chưa có chiến dịch nào</h2>
          <p>Tạo chiến dịch khuyến mãi đầu tiên để thu hút khách hàng.</p>
          <div style={{ marginTop: '1rem' }}>
            <Link
              to={`/admin/promotions/new${returnToParam}`}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Tạo chiến dịch mới
            </Link>
          </div>
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          {/* Bảng trên màn hình máy tính desktop */}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Tên chương trình</th>
                  <th scope="col">Mức giảm</th>
                  <th scope="col">Đơn tối thiểu</th>
                  <th scope="col">Thời gian áp dụng</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" style={{ textAlign: 'right' }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const complex = isComplexPromotion(item);
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        {complex && (
                          <span
                            className={`${styles.badge} ${styles.badgeComplex}`}
                            style={{ marginTop: '0.25rem' }}
                          >
                            Nâng cao (Chỉ xem)
                          </span>
                        )}
                      </td>
                      <td>
                        {item.discountType === 'PERCENTAGE'
                          ? `${Number(item.discountValue)}%${item.maxDiscountAmount ? ` (Tối đa ${formatCurrencyVnd(item.maxDiscountAmount)})` : ''}`
                          : formatCurrencyVnd(item.discountValue)}
                      </td>
                      <td>{formatCurrencyVnd(item.minOrderAmount)}</td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          <div>Từ: {formatDisplayDateTime(item.startsAt)}</div>
                          <div>Đến: {formatDisplayDateTime(item.endsAt)}</div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${item.status === 'ACTIVE' ? styles.badgeActive : styles.badgeInactive}`}
                        >
                          {item.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngưng hoạt động'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '0.5rem',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <Link
                            to={`/admin/promotions/${item.id}${returnToParam}`}
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            style={{ minHeight: '44px', padding: '0.25rem 0.75rem' }}
                          >
                            {complex ? 'Xem' : 'Chi tiết'}
                          </Link>
                          {!complex && (
                            <>
                              <button
                                type="button"
                                className={`${styles.btn} ${styles.btnSecondary}`}
                                style={{ minHeight: '44px', padding: '0.25rem 0.75rem' }}
                                onClick={(e) => statusAction.openDialog(item, e.currentTarget)}
                                disabled={statusAction.isItemLocked(item.id)}
                              >
                                {item.status === 'ACTIVE' ? 'Ngưng' : 'Kích hoạt'}
                              </button>
                              {statusAction.isItemLocked(item.id) && (
                                <button
                                  type="button"
                                  className={`${styles.btn} ${styles.btnSecondary}`}
                                  style={{
                                    minHeight: '44px',
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.75rem',
                                  }}
                                  onClick={() => void statusAction.recheckStatus(item.id)}
                                  title="Kiểm tra lại trạng thái từ máy chủ"
                                >
                                  Đối chiếu
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Danh sách thẻ cho màn hình di động nhỏ mobile (360px) */}
          <div className={styles.cardList}>
            {data.items.map((item) => {
              const complex = isComplexPromotion(item);
              return (
                <div key={item.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div>
                      <div className={styles.cardName}>{item.name}</div>
                      {complex && (
                        <span
                          className={`${styles.badge} ${styles.badgeComplex}`}
                          style={{ marginTop: '0.25rem' }}
                        >
                          Nâng cao (Chỉ xem)
                        </span>
                      )}
                    </div>
                    <span
                      className={`${styles.badge} ${item.status === 'ACTIVE' ? styles.badgeActive : styles.badgeInactive}`}
                    >
                      {item.status === 'ACTIVE' ? 'Đang bật' : 'Ngưng'}
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Mức giảm:</span>
                    <span className={styles.cardValue}>
                      {item.discountType === 'PERCENTAGE'
                        ? `${Number(item.discountValue)}%`
                        : formatCurrencyVnd(item.discountValue)}
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Đơn tối thiểu:</span>
                    <span className={styles.cardValue}>
                      {formatCurrencyVnd(item.minOrderAmount)}
                    </span>
                  </div>

                  <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>Hiệu lực:</span>
                    <span className={styles.cardValue} style={{ fontSize: '0.8125rem' }}>
                      {formatDisplayDateTime(item.startsAt)} — {formatDisplayDateTime(item.endsAt)}
                    </span>
                  </div>

                  <div className={styles.cardActions}>
                    <Link
                      to={`/admin/promotions/${item.id}${returnToParam}`}
                      className={`${styles.btn} ${styles.btnSecondary}`}
                      style={{ flex: 1 }}
                    >
                      {complex ? 'Xem' : 'Chi tiết'}
                    </Link>
                    {!complex && (
                      <>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSecondary}`}
                          style={{ flex: 1 }}
                          onClick={(e) => statusAction.openDialog(item, e.currentTarget)}
                          disabled={statusAction.isItemLocked(item.id)}
                        >
                          {item.status === 'ACTIVE' ? 'Ngưng' : 'Kích hoạt'}
                        </button>
                        {statusAction.isItemLocked(item.id) && (
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            style={{ flex: 1, fontSize: '0.8125rem' }}
                            onClick={() => void statusAction.recheckStatus(item.id)}
                          >
                            Đối chiếu
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phân trang */}
          <div className={styles.pagination}>
            <div className={styles.paginationInfo}>
              Hiển thị {data.items.length} trên tổng số {data.total} chiến dịch (Trang {data.page}/
              {Math.max(1, data.totalPages)})
            </div>
            <div className={styles.paginationControls}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                disabled={data.page <= 1}
                onClick={() => setPage(data.page - 1)}
              >
                Trang trước
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                disabled={data.page >= data.totalPages}
                onClick={() => setPage(data.page + 1)}
              >
                Trang sau
              </button>
            </div>
          </div>
        </>
      )}

      {statusAction.DialogComponent()}
    </div>
  );
}
