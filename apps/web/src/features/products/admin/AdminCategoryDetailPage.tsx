import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import {
  AdminForbidden,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ConfirmDialog, Loading } from '@/ui';

import {
  adminCategoriesKeys,
  type AdminCategoryDetail,
  categoryErrorText,
  categoryVisibilityBadge,
} from './admin-categories.api.js';
import styles from './AdminCategories.module.css';
import { useCategoryVisibilityAction } from './category-visibility-action.js';

export function AdminCategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const { busy, notice, noticeRef, checking, recheck, clearNotice, requestToggle, dialogProps } =
    useCategoryVisibilityAction();

  const query = useQuery({
    queryKey: adminCategoriesKeys.detail(actor, id ?? ''),
    enabled: Boolean(actor && id),
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminCategoryDetail>(`/admin/categories/${encodeURIComponent(id ?? '')}`, {
          signal,
        }),
      ),
    retry: shouldRetryAdminQuery,
  });

  if (forbidden) return <AdminForbidden />;

  const category = query.data;

  if (query.isLoading) {
    return (
      <div className={styles.page}>
        <div className="page-state">
          <Loading />
        </div>
      </div>
    );
  }

  if (query.isError || !category) {
    return (
      <div className={styles.page}>
        <Link to="/admin/categories" className={styles.backLink}>
          ← Về danh mục
        </Link>
        <div className="page-state" role="alert">
          <p>{categoryErrorText(query.error, 'detail')}</p>
          <button type="button" className="button-secondary" onClick={() => query.refetch()}>
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const badge = categoryVisibilityBadge(category);

  return (
    <div className={styles.page}>
      <Link to="/admin/categories" className={styles.backLink}>
        ← Về danh mục
      </Link>

      <header className={styles.header}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 className={styles.title}>{category.name}</h1>
            <p className={styles.description}>Đường dẫn tĩnh: /{category.slug}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            className={`${styles.toggleButton} ${
              category.isActive ? styles.hideAction : styles.showAction
            }`}
            onClick={(e) =>
              requestToggle(
                {
                  id: category.id,
                  name: category.name,
                  isActive: category.isActive,
                  updatedAt: category.updatedAt,
                  isParent: category.children.length > 0,
                  parentHidden: category.parentHidden,
                },
                e.currentTarget,
              )
            }
          >
            {category.isActive ? 'Ẩn danh mục' : 'Hiện danh mục'}
          </button>
        </div>
      </header>

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className={`${styles.notice} ${notice.error ? styles.noticeError : styles.noticeSuccess}`}
          role={notice.error ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{notice.text}</span>
          {notice.recheck && (
            <button
              type="button"
              className={styles.recheckButton}
              disabled={checking}
              onClick={() => void recheck()}
            >
              {checking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
            </button>
          )}
          <button
            type="button"
            className={styles.toggleButton}
            onClick={clearNotice}
            aria-label="Đóng thông báo"
          >
            Đóng
          </button>
        </div>
      )}

      <div className={styles.detailCard}>
        <h2 style={{ fontSize: '1.125rem', margin: '0 0 1rem 0' }}>Thông tin danh mục</h2>
        <div className={styles.detailGrid}>
          <div className={styles.detailField}>
            <label>Trạng thái hiển thị</label>
            <span
              className={`${styles.badge} ${
                badge.variant === 'active'
                  ? styles.badgeActive
                  : badge.variant === 'parent-hidden'
                    ? styles.badgeParentHidden
                    : styles.badgeHidden
              }`}
            >
              {badge.text}
            </span>
          </div>

          <div className={styles.detailField}>
            <label>Thứ tự sắp xếp</label>
            <span>{category.sortOrder}</span>
          </div>

          <div className={styles.detailField}>
            <label>Sản phẩm trực tiếp</label>
            <span>{category.productCount}</span>
          </div>

          <div className={styles.detailField}>
            <label>Tổng sản phẩm cả nhánh</label>
            <span>{category.subtreeProductCount}</span>
          </div>

          {category.parent && (
            <div className={styles.detailField}>
              <label>Danh mục cha</label>
              <span>
                <Link
                  to={`/admin/categories/${encodeURIComponent(category.parent.id)}`}
                  className={styles.categoryLink}
                >
                  {category.parent.name}
                </Link>{' '}
                ({category.parent.isActive ? 'Đang hiện' : 'Đang ẩn'})
              </span>
            </div>
          )}

          <div className={styles.detailField}>
            <label>Cập nhật lần cuối</label>
            <span>{new Date(category.updatedAt).toLocaleString('vi-VN')}</span>
          </div>
        </div>
      </div>

      {category.children.length > 0 && (
        <div className={styles.treeContainer}>
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--color-ivory-300, #e6e0d5)',
              backgroundColor: 'var(--color-ivory-50, #faf8f5)',
            }}
          >
            <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 600 }}>
              Các danh mục con ({category.children.length})
            </h2>
          </div>
          <table className={styles.treeTable}>
            <thead>
              <tr>
                <th scope="col">Tên danh mục con</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Sản phẩm trực tiếp</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Chi tiết
                </th>
              </tr>
            </thead>
            <tbody>
              {category.children.map((child) => {
                const childBadge = categoryVisibilityBadge(child);
                return (
                  <tr key={child.id} data-testid={`child-row-${child.slug}`}>
                    <td>
                      <Link
                        to={`/admin/categories/${encodeURIComponent(child.id)}`}
                        className={styles.categoryLink}
                      >
                        {child.name}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          childBadge.variant === 'active'
                            ? styles.badgeActive
                            : childBadge.variant === 'parent-hidden'
                              ? styles.badgeParentHidden
                              : styles.badgeHidden
                        }`}
                      >
                        {childBadge.text}
                      </span>
                    </td>
                    <td>{child.productCount}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/admin/categories/${encodeURIComponent(child.id)}`}
                        className={styles.categoryLink}
                      >
                        Xem
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
