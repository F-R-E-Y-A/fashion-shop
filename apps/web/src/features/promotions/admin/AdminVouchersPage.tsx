import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { formatDateTime, formatPrice } from '@/core';
import { AdminForbidden } from '@/features/account';
import { ConfirmDialog } from '@/ui';

import { type AdminVoucher, voucherErrorText, voucherStatusBadge } from './admin-vouchers.api.js';
import styles from './AdminVouchers.module.css';
import { useAdminVouchersList } from './use-admin-vouchers.js';
import { useVoucherStatusAction } from './voucher-status-action.js';

export function AdminVouchersPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchFromUrl = searchParams.get('search') ?? '';
  const statusFromUrl = (searchParams.get('status') as 'ACTIVE' | 'INACTIVE' | null) ?? undefined;
  const pageFromUrl = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = 12;

  const currentListUrl = `/admin/vouchers${location.search}`;

  const [searchInput, setSearchInput] = useState(searchFromUrl);
  const [prevSearchFromUrl, setPrevSearchFromUrl] = useState(searchFromUrl);

  if (searchFromUrl !== prevSearchFromUrl) {
    setPrevSearchFromUrl(searchFromUrl);
    setSearchInput(searchFromUrl);
  }

  const { result, forbidden, data } = useAdminVouchersList({
    search: searchFromUrl || undefined,
    status: statusFromUrl,
    page: pageFromUrl,
    pageSize,
  });

  const {
    open: openStatusDialog,
    dialogProps,
    notice,
    noticeRef,
    clearNotice,
    recheckCurrent,
    pending: isStatusPending,
    checking: isStatusChecking,
  } = useVoucherStatusAction();

  if (forbidden) {
    return <AdminForbidden />;
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput.trim()) {
      next.set('search', searchInput.trim().toUpperCase());
    } else {
      next.delete('search');
    }
    next.set('page', '1');
    setSearchParams(next);
  }

  function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val === 'ACTIVE' || val === 'INACTIVE') {
      next.set('status', val);
    } else {
      next.delete('status');
    }
    next.set('page', '1');
    setSearchParams(next);
  }

  function goToPage(newPage: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  }

  const items: AdminVoucher[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  function renderDiscount(v: AdminVoucher) {
    if (v.discountType === 'PERCENTAGE') {
      return (
        <span>
          {v.discountValue}%
          {v.maxDiscountAmount ? ` (Tối đa ${formatPrice(v.maxDiscountAmount)})` : ''}
        </span>
      );
    }
    return <span>{formatPrice(v.discountValue)}</span>;
  }

  function renderValidity(v: AdminVoucher) {
    if (!v.startsAt && !v.endsAt) return <span>Vô thời hạn</span>;
    if (v.startsAt && !v.endsAt) return <span>Từ {formatDateTime(v.startsAt)}</span>;
    if (!v.startsAt && v.endsAt) return <span>Đến {formatDateTime(v.endsAt)}</span>;
    return (
      <span>
        {formatDateTime(v.startsAt!)} – {formatDateTime(v.endsAt!)}
      </span>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mã giảm giá</h1>
          <p className={styles.description}>
            Quản lý danh sách voucher, điều kiện áp dụng và trạng thái kích hoạt.
          </p>
        </div>
        <Link
          to="/admin/vouchers/new"
          state={{ returnTo: currentListUrl }}
          className={styles.primaryButton}
        >
          + Thêm mã giảm giá
        </Link>
      </header>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className={`${styles.notice} ${notice.error ? styles.noticeError : styles.noticeSuccess}`}
          role="status"
        >
          <span>{notice.text}</span>
          {notice.recheck && recheckCurrent && (
            <button
              type="button"
              className={styles.recheckButton}
              onClick={recheckCurrent}
              disabled={isStatusChecking}
            >
              Kiểm tra lại trạng thái
            </button>
          )}
          {!notice.recheck && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={clearNotice}
              aria-label="Đóng thông báo"
            >
              ✕
            </button>
          )}
        </div>
      )}

      <form className={styles.controls} onSubmit={handleSearchSubmit}>
        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Tìm theo mã voucher (VD: CHAOBAN)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Tìm theo mã voucher"
          />
        </div>
        <select
          className={styles.filterSelect}
          value={statusFromUrl ?? ''}
          onChange={handleStatusChange}
          aria-label="Lọc theo trạng thái"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
        <button type="submit" className={styles.secondaryButton}>
          Tìm kiếm
        </button>
      </form>

      {result.isLoading ? (
        <div className={styles.emptyState}>
          <p>Đang tải danh sách mã giảm giá…</p>
        </div>
      ) : result.isError ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Không thể tải danh sách mã giảm giá</p>
          <p>{voucherErrorText(result.error, 'list')}</p>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => result.refetch()}
            style={{ marginTop: '1rem' }}
          >
            Thử lại
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>
            {searchFromUrl || statusFromUrl
              ? 'Không tìm thấy mã giảm giá phù hợp'
              : 'Chưa có mã giảm giá nào'}
          </p>
          <p>
            {searchFromUrl || statusFromUrl
              ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'
              : 'Bắt đầu bằng việc tạo mã giảm giá đầu tiên cho cửa hàng.'}
          </p>
          {!searchFromUrl && !statusFromUrl && (
            <Link
              to="/admin/vouchers/new"
              className={styles.primaryButton}
              style={{ marginTop: '1rem' }}
            >
              Tạo mã giảm giá
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Mã code</th>
                  <th>Mức giảm</th>
                  <th>Đơn tối thiểu</th>
                  <th>Lượt dùng</th>
                  <th>Thời gian hiệu lực</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const badge = voucherStatusBadge(v);
                  const badgeClass =
                    badge.variant === 'active'
                      ? styles.badgeActive
                      : badge.variant === 'scheduled'
                        ? styles.badgeScheduled
                        : badge.variant === 'expired'
                          ? styles.badgeExpired
                          : styles.badgeInactive;

                  return (
                    <tr key={v.id}>
                      <td className={styles.codeCell}>{v.code}</td>
                      <td>{renderDiscount(v)}</td>
                      <td>{v.minOrderAmount ? formatPrice(v.minOrderAmount) : 'Không yêu cầu'}</td>
                      <td>
                        {v.usageCount}
                        {v.usageLimit ? ` / ${v.usageLimit}` : ' (Không giới hạn)'}
                      </td>
                      <td>{renderValidity(v)}</td>
                      <td>
                        <span className={`${styles.badge} ${badgeClass}`}>{badge.text}</span>
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          <Link
                            to={`/admin/vouchers/${v.id}`}
                            state={{ returnTo: currentListUrl }}
                            className={styles.actionButton}
                            aria-label={`Xem chi tiết ${v.code}`}
                          >
                            Chi tiết
                          </Link>
                          <button
                            type="button"
                            className={`${styles.toggleButton} ${
                              v.status === 'ACTIVE'
                                ? styles.toggleDeactivate
                                : styles.toggleActivate
                            }`}
                            disabled={isStatusPending}
                            onClick={(e) =>
                              openStatusDialog(
                                {
                                  id: v.id,
                                  code: v.code,
                                  status: v.status,
                                  updatedAt: v.updatedAt,
                                },
                                e.currentTarget,
                              )
                            }
                          >
                            {v.status === 'ACTIVE' ? 'Ngừng' : 'Bật'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className={styles.cardList}>
            {items.map((v) => {
              const badge = voucherStatusBadge(v);
              const badgeClass =
                badge.variant === 'active'
                  ? styles.badgeActive
                  : badge.variant === 'scheduled'
                    ? styles.badgeScheduled
                    : badge.variant === 'expired'
                      ? styles.badgeExpired
                      : styles.badgeInactive;

              return (
                <div key={v.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span className={styles.codeCell}>{v.code}</span>
                    <span className={`${styles.badge} ${badgeClass}`}>{badge.text}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Mức giảm:</span>
                    <span>{renderDiscount(v)}</span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Đơn tối thiểu:</span>
                    <span>
                      {v.minOrderAmount ? formatPrice(v.minOrderAmount) : 'Không yêu cầu'}
                    </span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Đã dùng:</span>
                    <span>
                      {v.usageCount}
                      {v.usageLimit ? ` / ${v.usageLimit}` : ' lượt'}
                    </span>
                  </div>
                  <div className={styles.cardRow}>
                    <span>Hiệu lực:</span>
                    <span>{renderValidity(v)}</span>
                  </div>
                  <div className={styles.cardActions}>
                    <Link
                      to={`/admin/vouchers/${v.id}`}
                      state={{ returnTo: currentListUrl }}
                      className={styles.actionButton}
                    >
                      Chi tiết
                    </Link>
                    <button
                      type="button"
                      className={`${styles.toggleButton} ${
                        v.status === 'ACTIVE' ? styles.toggleDeactivate : styles.toggleActivate
                      }`}
                      disabled={isStatusPending}
                      onClick={(e) =>
                        openStatusDialog(
                          {
                            id: v.id,
                            code: v.code,
                            status: v.status,
                            updatedAt: v.updatedAt,
                          },
                          e.currentTarget,
                        )
                      }
                    >
                      {v.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>
                Hiển thị trang {pageFromUrl} / {totalPages} (Tổng số {total} mã giảm giá)
              </span>
              <div className={styles.pageButtons}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={pageFromUrl <= 1}
                  onClick={() => goToPage(pageFromUrl - 1)}
                >
                  ← Trước
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={pageFromUrl >= totalPages}
                  onClick={() => goToPage(pageFromUrl + 1)}
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
