import { type FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { formatDateTime, formatPrice } from '@/core';
import { AdminForbidden, useAuth } from '@/features/account';
import { Empty, ErrorNote, Loading, Pager } from '@/ui';

import {
  adminCatalogKeys,
  type AdminCatalogPage as CatalogPage,
  catalogErrorText,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';
import {
  catalogListPath,
  type CatalogQuery,
  catalogSearch,
  parseCatalogQuery,
} from './catalog-query.js';
import { useAdminCatalog } from './use-admin-catalog.js';

export function AdminCatalogPage() {
  const { user, getSessionEpoch } = useAuth();
  return <CatalogList key={`${user?.id}:${getSessionEpoch()}`} />;
}
function CatalogList() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const query = parseCatalogQuery(location.search);
  const canonical = catalogSearch(query);
  const needsCanonical = canonical !== location.search;
  const [draft, setDraft] = useState(query.q);
  const [locationKey, setLocationKey] = useState(location.key);
  if (location.key !== locationKey) {
    setLocationKey(location.key);
    setDraft(query.q);
  }
  const { result, data, forbidden } = useAdminCatalog<CatalogPage>(
    adminCatalogKeys.list(user?.id ?? '', query),
    catalogListPath(query),
    !needsCanonical,
  );
  const update = (changes: Partial<CatalogQuery>) =>
    navigate(catalogListPath({ ...query, page: 1, ...changes }));
  const search = (event: FormEvent) => {
    event.preventDefault();
    update({ q: draft.trim().slice(0, 120) });
  };
  if (forbidden) return <AdminForbidden />;
  if (needsCanonical) return <Navigate replace to={catalogListPath(query)} />;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Danh mục hàng hóa</p>
        <div className={styles.headingRow}>
          <h1 className={styles.title}>Sản phẩm</h1>
          {data && <p className={styles.count}>{data.total} sản phẩm</p>}
        </div>
        <p className={styles.intro}>
          Tra cứu thông tin, biến thể và hình ảnh, bao gồm sản phẩm đã ngừng bán.
        </p>
      </header>
      <section className={styles.controls} aria-label="Tìm và lọc sản phẩm">
        <form role="search" className={styles.searchForm} onSubmit={search}>
          <label className={styles.searchLabel} htmlFor="catalog-q">
            Tên sản phẩm hoặc SKU
          </label>
          <div className={styles.searchRow}>
            <input
              id="catalog-q"
              className={styles.searchInput}
              value={draft}
              maxLength={120}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nhập tên hoặc mã SKU…"
            />
            <button className={styles.searchButton} type="submit">
              Tìm
            </button>
          </div>
        </form>
        <div className={styles.filters}>
          <label className={styles.field}>
            <span>Cờ hoạt động</span>
            <select
              value={query.status}
              onChange={(event) => update({ status: event.target.value as CatalogQuery['status'] })}
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang bật</option>
              <option value="inactive">Đã ngừng bán</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Sắp xếp</span>
            <select
              value={query.sort}
              onChange={(event) => update({ sort: event.target.value as CatalogQuery['sort'] })}
            >
              <option value="newest">Mới nhất</option>
              <option value="name_asc">Tên A–Z</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Số dòng</span>
            <select
              value={query.pageSize}
              onChange={(event) => update({ pageSize: Number(event.target.value) })}
            >
              {[...new Set([12, 24, 60, query.pageSize])]
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
            </select>
          </label>
          {(query.q ||
            query.status !== 'all' ||
            query.sort !== 'newest' ||
            query.pageSize !== 12) && (
            <Link className={styles.back} to="/admin/products">
              Đặt lại điều kiện
            </Link>
          )}
        </div>
      </section>
      {result.isPending && <Loading label="Đang tải sản phẩm…" />}
      {result.isError && (
        <ErrorNote
          label={catalogErrorText(result.error, 'list')}
          onRetry={() => void result.refetch()}
        />
      )}
      {data && (
        <>
          <p className={styles.hint}>
            “Đang bật” chỉ là cờ sản phẩm, không đảm bảo còn hàng hoặc mua được. Giá là giá tổng hợp
            đang lưu.
          </p>
          {data.items.length === 0 && (
            <>
              <Empty
                label={
                  query.page > 1
                    ? `Trang ${query.page} không còn sản phẩm.`
                    : query.q || query.status !== 'all'
                      ? 'Không có sản phẩm khớp điều kiện.'
                      : 'Chưa có sản phẩm.'
                }
              />
              {query.page > 1 && (
                <Link
                  className={styles.back}
                  to={catalogListPath({ ...query, page: Math.max(1, data.totalPages) })}
                >
                  Về trang hợp lệ
                </Link>
              )}
            </>
          )}
          {data.items.length > 0 && (
            <div className={styles.tableWrap} aria-busy={result.isFetching}>
              <table className={styles.table}>
                <caption className="sr-only">Danh sách sản phẩm quản trị</caption>
                <thead>
                  <tr>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Phân loại</th>
                    <th scope="col">Giá tổng hợp</th>
                    <th scope="col">Cờ hoạt động</th>
                    <th scope="col">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((product) => (
                    <tr key={product.id}>
                      <td data-label="Sản phẩm">
                        <div className={styles.productCell}>
                          {product.imageUrl ? (
                            <img
                              className={styles.thumbnail}
                              src={product.imageUrl}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className={styles.noImage}>Chưa có ảnh</span>
                          )}
                          <div className={styles.productText}>
                            <Link
                              className={styles.productName}
                              to={`/admin/products/${encodeURIComponent(product.id)}${canonical}`}
                            >
                              {product.name}
                            </Link>
                            <span className={styles.sub}>{product.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Phân loại">
                        <div>
                          {product.category.name}
                          <span className={styles.sub}>
                            {product.brand?.name ?? 'Chưa có thương hiệu'}
                          </span>
                        </div>
                      </td>
                      <td data-label="Giá tổng hợp">{formatPrice(product.priceFrom)}</td>
                      <td data-label="Cờ hoạt động">
                        <span
                          className={styles.badge}
                          data-tone={product.isActive ? 'accent' : 'muted'}
                        >
                          {product.isActive ? 'Đang bật' : 'Đã ngừng bán'}
                        </span>
                      </td>
                      <td data-label="Ngày tạo">{formatDateTime(product.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.items.length > 0 && (
            <Pager
              page={query.page}
              totalPages={data.totalPages}
              total={data.total}
              unit="sản phẩm"
              onChange={(page) => update({ page })}
            />
          )}
        </>
      )}
    </div>
  );
}
