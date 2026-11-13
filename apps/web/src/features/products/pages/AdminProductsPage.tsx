import { useQuery } from '@tanstack/react-query';

import { ErrorNote, Loading } from '@/ui';

import { listProducts, productKeys } from '../api/index.js';
import styles from './AdminProductsPage.module.css';

/**
 * Màn tổng quan quản trị (hiện dùng số liệu sản phẩm đang bán của Bảo).
 * Giữ nguyên logic query và contract; nâng cấp cấu trúc AdminKit F.R.E.Y.A.
 */
export function AdminProductsPage() {
  const params = { page: 1, pageSize: 1 };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => listProducts(params),
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Tổng quan</p>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Tổng quan cửa hàng</h1>
        </div>
        <p className={styles.description}>
          Hiển thị tổng số sản phẩm công khai đang hoạt động từ danh mục cửa hàng.
        </p>
      </header>

      {isPending && <Loading label="Đang tải dữ liệu tổng quan…" />}

      {isError && (
        <ErrorNote
          label="Không thể tải dữ liệu tổng quan. Vui lòng thử lại."
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && (
        <div className={styles.statGrid}>
          <section className={styles.statCard} aria-labelledby="stat-products-label">
            <div className={styles.statHeader}>
              <h2 id="stat-products-label" className={styles.statLabel}>
                Sản phẩm công khai
              </h2>
            </div>
            <p className={styles.statValue}>
              {data?.total !== undefined && data?.total !== null
                ? data.total.toLocaleString('vi-VN')
                : '—'}
            </p>
            <p className={styles.statNote}>Số lượng sản phẩm trong danh mục hiển thị</p>
          </section>
        </div>
      )}
    </div>
  );
}
