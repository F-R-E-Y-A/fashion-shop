import { Link, Navigate, useLocation, useParams } from 'react-router-dom';

import { formatDateTime, formatPrice } from '@/core';
import { AdminForbidden, useAuth } from '@/features/account';
import { Empty, ErrorNote, Loading } from '@/ui';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  catalogErrorText,
  catalogStatusLabel,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';
import { catalogListPath, catalogSearch, parseCatalogQuery } from './catalog-query.js';
import {
  ProductStatusButton,
  ProductStatusFeedback,
  useProductStatusAction,
} from './product-status-action.js';
import { useAdminCatalog } from './use-admin-catalog.js';

export function AdminCatalogDetailPage() {
  const { user, getSessionEpoch } = useAuth();
  const { id = '' } = useParams();
  return <CatalogDetail key={`${user?.id}:${getSessionEpoch()}:${id}`} id={id} />;
}
function CatalogDetail({ id }: { id: string }) {
  const action = useProductStatusAction();
  const { user } = useAuth();
  const location = useLocation();
  const query = parseCatalogQuery(location.search);
  const canonical = catalogSearch(query);
  const path = `/admin/products/${encodeURIComponent(id)}`;
  const { result, data, forbidden } = useAdminCatalog<AdminCatalogDetail>(
    adminCatalogKeys.detail(user?.id ?? '', id),
    path,
    canonical === location.search,
  );
  if (forbidden) return <AdminForbidden />;
  if (canonical !== location.search) return <Navigate replace to={`${path}${canonical}`} />;
  return (
    <div className={styles.page}>
      <Link className={styles.back} to={catalogListPath(query)}>
        ← Về danh sách sản phẩm
      </Link>
      <ProductStatusFeedback action={action} />
      {result.isPending && <Loading label="Đang tải chi tiết sản phẩm…" />}
      {result.isError && (
        <ErrorNote
          label={catalogErrorText(result.error, 'detail')}
          onRetry={() => void result.refetch()}
        />
      )}
      {data && (
        <>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Chi tiết sản phẩm</p>
            <h1 className={styles.title}>{data.name}</h1>
            <p className={styles.slug}>{data.slug}</p>
            <span className={styles.badge} data-tone={data.isActive ? 'accent' : 'muted'}>
              {catalogStatusLabel(data)}
            </span>
            <ProductStatusButton product={data} action={action} />
          </header>
          <div className={styles.detailGrid}>
            <section className={styles.panel} aria-labelledby="catalog-info">
              <h2 id="catalog-info" className={styles.panelTitle}>
                Thông tin sản phẩm
              </h2>
              <dl className={styles.facts}>
                <Fact label="ID">{data.id}</Fact>
                <Fact label="Danh mục">
                  {data.category.name}
                  {!data.category.isActive && ' · Đã ẩn'}
                </Fact>
                <Fact label="Thương hiệu">{data.brand?.name ?? 'Chưa có'}</Fact>
                <Fact label="Giá tổng hợp đang lưu">{formatPrice(data.priceFrom)}</Fact>
                <Fact label="Nổi bật">{data.isFeatured ? 'Có' : 'Không'}</Fact>
                <Fact label="Đối tượng">
                  {{ nam: 'Nam', nu: 'Nữ', unisex: 'Unisex' }[data.audience ?? ''] ??
                    'Chưa xác định'}
                </Fact>
                <Fact label="Chất liệu">{data.material ?? 'Chưa có'}</Fact>
                <Fact label="Hướng dẫn bảo quản">{data.careInstructions ?? 'Chưa có'}</Fact>
                <Fact label="Ngày tạo">{formatDateTime(data.createdAt)}</Fact>
                <Fact label="Cập nhật">{formatDateTime(data.updatedAt)}</Fact>
              </dl>
              <p className={styles.hint}>
                Cờ hoạt động và giá tổng hợp không đảm bảo sản phẩm còn hàng hoặc mua được.
              </p>
            </section>
            <section className={styles.panel} aria-labelledby="catalog-description">
              <h2 id="catalog-description" className={styles.panelTitle}>
                Mô tả
              </h2>
              <p className={styles.description}>{data.description ?? 'Chưa có mô tả.'}</p>
            </section>
          </div>
          <section aria-labelledby="catalog-variants" className={styles.section}>
            <h2 id="catalog-variants" className={styles.panelTitle}>
              Biến thể ({data.variants.length})
            </h2>
            {data.variants.length === 0 ? (
              <Empty label="Chưa có biến thể." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <caption className="sr-only">Các biến thể, bao gồm biến thể ngừng bán</caption>
                  <thead>
                    <tr>
                      <th scope="col">SKU</th>
                      <th scope="col">Màu / Cỡ</th>
                      <th scope="col">Giá niêm yết</th>
                      <th scope="col">Giá giảm</th>
                      <th scope="col">Cờ hoạt động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.variants.map((variant) => (
                      <tr key={variant.id}>
                        <td data-label="SKU">
                          <span className={styles.sku}>{variant.sku}</span>
                        </td>
                        <td data-label="Màu / Cỡ">
                          {variant.color.name} / {variant.sizeCode}
                        </td>
                        <td data-label="Giá niêm yết">{formatPrice(variant.listPrice)}</td>
                        <td data-label="Giá giảm">
                          {variant.salePrice === null ? 'Không có' : formatPrice(variant.salePrice)}
                        </td>
                        <td data-label="Cờ hoạt động">
                          {variant.isActive ? 'Đang bật' : 'Đã ngừng bán'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section aria-labelledby="catalog-images" className={styles.section}>
            <h2 id="catalog-images" className={styles.panelTitle}>
              Hình ảnh ({data.images.length})
            </h2>
            {data.images.length === 0 ? (
              <Empty label="Chưa có ảnh." />
            ) : (
              <div className={styles.gallery}>
                {data.images.map((img) => (
                  <figure className={styles.figure} key={img.id}>
                    <img src={img.url} alt={img.alt ?? data.name} loading="lazy" />
                    <figcaption>
                      Thứ tự {img.sortOrder} · {img.color?.name ?? 'Ảnh chung'}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
