import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import {
  AdminForbidden,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ConfirmDialog, Loading } from '@/ui';

import {
  adminCategoriesKeys,
  type AdminCategoryNode,
  categoryErrorText,
  categoryVisibilityBadge,
} from './admin-categories.api.js';
import styles from './AdminCategories.module.css';
import { useCategoryVisibilityAction } from './category-visibility-action.js';

export function AdminCategoriesPage() {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const { busy, notice, noticeRef, checking, recheck, clearNotice, requestToggle, dialogProps } =
    useCategoryVisibilityAction();

  const query = useQuery({
    queryKey: adminCategoriesKeys.tree(actor),
    enabled: Boolean(actor),
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminCategoryNode[]>('/admin/categories', {
          signal,
        }),
      ),
    retry: shouldRetryAdminQuery,
  });

  if (forbidden) return <AdminForbidden />;

  const categories = query.data ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Quản lý danh mục</h1>
        <p className={styles.description}>
          Duyệt cây phân cấp, kiểm tra số lượng sản phẩm và quản lý trạng thái hiển thị ẩn/hiện trên
          cửa hàng.
        </p>
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

      {query.isLoading && (
        <div className="page-state">
          <Loading />
        </div>
      )}

      {query.isError && (
        <div className="page-state" role="alert">
          <p>{categoryErrorText(query.error, 'list')}</p>
          <button type="button" className="button-secondary" onClick={() => query.refetch()}>
            Thử lại
          </button>
        </div>
      )}

      {!query.isLoading && !query.isError && categories.length === 0 && (
        <div className="page-state">
          <p>Chưa có danh mục nào trong hệ thống.</p>
        </div>
      )}

      {!query.isLoading && !query.isError && categories.length > 0 && (
        <div className={styles.treeContainer}>
          <table className={styles.treeTable}>
            <thead>
              <tr>
                <th scope="col">Tên danh mục</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Sản phẩm trực tiếp</th>
                <th scope="col">Tổng cả nhánh</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((root) => {
                const rootBadge = categoryVisibilityBadge(root);
                return (
                  <Fragment key={root.id}>
                    <tr className={styles.rootRow} data-testid={`category-row-${root.slug}`}>
                      <td data-label="Tên danh mục">
                        <Link
                          to={`/admin/categories/${encodeURIComponent(root.id)}`}
                          className={styles.categoryLink}
                        >
                          {root.name}
                        </Link>
                      </td>
                      <td data-label="Trạng thái">
                        <span
                          className={`${styles.badge} ${
                            rootBadge.variant === 'active' ? styles.badgeActive : styles.badgeHidden
                          }`}
                        >
                          {rootBadge.text}
                        </span>
                      </td>
                      <td data-label="Sản phẩm trực tiếp" className={styles.countColumn}>
                        <span className={styles.countValue}>{root.productCount}</span>
                      </td>
                      <td data-label="Tổng cả nhánh" className={styles.countColumn}>
                        <span className={styles.countValue}>{root.subtreeProductCount}</span>
                      </td>
                      <td data-label="Thao tác">
                        <div className={styles.actions}>
                          <button
                            type="button"
                            disabled={busy}
                            className={`${styles.toggleButton} ${
                              root.isActive ? styles.hideAction : styles.showAction
                            }`}
                            onClick={(e) =>
                              requestToggle(
                                {
                                  id: root.id,
                                  name: root.name,
                                  isActive: root.isActive,
                                  updatedAt: root.updatedAt,
                                  isParent: true,
                                },
                                e.currentTarget,
                              )
                            }
                            aria-label={`${root.isActive ? 'Ẩn' : 'Hiện'} danh mục ${root.name}`}
                          >
                            {root.isActive ? 'Ẩn' : 'Hiện'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {root.children.map((child) => {
                      const childBadge = categoryVisibilityBadge(child);
                      return (
                        <tr
                          key={child.id}
                          className={styles.childRow}
                          data-testid={`category-row-${child.slug}`}
                        >
                          <td data-label="Tên danh mục">
                            <div className={styles.categoryNameCell}>
                              <span className={styles.indent} aria-hidden="true" />
                              <Link
                                to={`/admin/categories/${encodeURIComponent(child.id)}`}
                                className={styles.categoryLink}
                              >
                                {child.name}
                              </Link>
                            </div>
                          </td>
                          <td data-label="Trạng thái">
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
                          <td data-label="Sản phẩm trực tiếp" className={styles.countColumn}>
                            <span className={styles.countValue}>{child.productCount}</span>
                          </td>
                          <td data-label="Tổng cả nhánh" className={styles.countColumn}>
                            <span className={styles.countValue}>{child.subtreeProductCount}</span>
                          </td>
                          <td data-label="Thao tác">
                            <div className={styles.actions}>
                              <button
                                type="button"
                                disabled={busy}
                                className={`${styles.toggleButton} ${
                                  child.isActive ? styles.hideAction : styles.showAction
                                }`}
                                onClick={(e) =>
                                  requestToggle(
                                    {
                                      id: child.id,
                                      name: child.name,
                                      isActive: child.isActive,
                                      updatedAt: child.updatedAt,
                                      isParent: false,
                                      parentHidden: child.parentHidden,
                                    },
                                    e.currentTarget,
                                  )
                                }
                                aria-label={`${child.isActive ? 'Ẩn' : 'Hiện'} danh mục con ${child.name}`}
                              >
                                {child.isActive ? 'Ẩn' : 'Hiện'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
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
