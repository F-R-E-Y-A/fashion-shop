import { useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';
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

export interface CategorySummaryMetrics {
  totalCategories: number;
  visibleCategories: number;
  hiddenCategories: number;
  categorizedProducts: number;
}

/**
 * Tính 4 chỉ số tổng hợp trên toàn cây danh mục.
 * Duyệt mỗi node đúng một lần; chỉ cộng `productCount` (không cộng `subtreeProductCount` để tránh đếm trùng).
 */
export function computeCategorySummary(nodes: AdminCategoryNode[]): CategorySummaryMetrics {
  let totalCategories = 0;
  let visibleCategories = 0;
  let categorizedProducts = 0;

  const walk = (list: AdminCategoryNode[]) => {
    for (const node of list) {
      totalCategories += 1;
      if (node.effectiveActive) {
        visibleCategories += 1;
      }
      categorizedProducts += node.productCount;
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(nodes);

  return {
    totalCategories,
    visibleCategories,
    hiddenCategories: totalCategories - visibleCategories,
    categorizedProducts,
  };
}

function matchesCategoryTerm(node: AdminCategoryNode, term: string): boolean {
  return node.name.toLowerCase().includes(term) || node.slug.toLowerCase().includes(term);
}

/**
 * Lọc cây danh mục theo tên hoặc slug trên dữ liệu đã tải.
 * Nếu chỉ danh mục con khớp, giữ danh mục cha làm ngữ cảnh và chỉ giữ các con khớp.
 */
export function filterCategoryTree(
  nodes: AdminCategoryNode[],
  rawQuery: string,
): AdminCategoryNode[] {
  const term = rawQuery.trim().toLowerCase();
  if (!term) return nodes;

  const result: AdminCategoryNode[] = [];
  for (const node of nodes) {
    const selfMatch = matchesCategoryTerm(node, term);
    const filteredChildren = filterCategoryTree(node.children, term);

    if (selfMatch) {
      result.push(node);
    } else if (filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

function collectParentIds(nodes: AdminCategoryNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.push(node.id);
    }
  }
  return ids;
}

export function AdminCategoriesPage() {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const { busy, notice, noticeRef, checking, recheck, clearNotice, requestToggle, dialogProps } =
    useCategoryVisibilityAction();

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

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

  const categories = useMemo(() => query.data ?? [], [query.data]);
  const summary = useMemo(() => computeCategorySummary(categories), [categories]);
  const allParentIds = useMemo(() => collectParentIds(categories), [categories]);

  const trimmedSearch = searchQuery.trim();
  const hasSearch = trimmedSearch.length > 0;
  const filteredCategories = useMemo(
    () => filterCategoryTree(categories, trimmedSearch),
    [categories, trimmedSearch],
  );

  if (forbidden) return <AdminForbidden />;

  const toggleBranch = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedIds(new Set());
  };

  const collapseAll = () => {
    setCollapsedIds(new Set(allParentIds));
  };

  const allCollapsed =
    allParentIds.length > 0 && allParentIds.every((parentId) => collapsedIds.has(parentId));

  const readyWithData = !query.isLoading && !query.isError && query.data !== undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Phân loại sản phẩm</p>
        <h1 className={styles.title}>Quản lý danh mục</h1>
        <p className={styles.description}>
          Duyệt cây phân cấp, theo dõi số lượng sản phẩm đã phân loại và quản lý trạng thái hiển thị
          ẩn/hiện trên cửa hàng.
        </p>
      </header>

      {readyWithData && categories.length > 0 && (
        <section className={styles.kpiGrid} aria-label="Tóm tắt danh mục">
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Tổng danh mục</span>
            <p className={styles.kpiValue} data-testid="kpi-total-categories">
              {summary.totalCategories}
            </p>
            <span className={styles.kpiHint}>Toàn bộ danh mục cha và con</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Hiển thị</span>
            <p
              className={`${styles.kpiValue} ${styles.kpiValueSuccess}`}
              data-testid="kpi-visible-categories"
            >
              {summary.visibleCategories}
            </p>
            <span className={styles.kpiHint}>Đang hiển thị hiệu lực trên cửa hàng</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Đang ẩn</span>
            <p
              className={`${styles.kpiValue} ${styles.kpiValueAccent}`}
              data-testid="kpi-hidden-categories"
            >
              {summary.hiddenCategories}
            </p>
            <span className={styles.kpiHint}>Gồm ẩn trực tiếp và ẩn do cha</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Sản phẩm đã phân loại</span>
            <p className={styles.kpiValue} data-testid="kpi-categorized-products">
              {summary.categorizedProducts}
            </p>
            <span className={styles.kpiHint}>Tổng sản phẩm gắn vào các danh mục</span>
          </div>
        </section>
      )}

      {notice && (
        <div
          ref={noticeRef}
          tabIndex={-1}
          className={`${styles.notice} ${notice.error ? styles.noticeError : styles.noticeSuccess}`}
          role={notice.error ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{notice.text}</span>
          <div className={styles.noticeActions}>
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

      {readyWithData && categories.length === 0 && (
        <div className="page-state">
          <p>Chưa có danh mục nào trong hệ thống.</p>
        </div>
      )}

      {readyWithData && categories.length > 0 && (
        <>
          <div className={styles.toolbar} role="search" aria-label="Tìm kiếm và điều khiển cây">
            <div className={styles.searchWrap}>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo tên danh mục hoặc slug…"
                aria-label="Tìm theo tên danh mục hoặc slug"
                className={styles.searchInput}
              />
              {hasSearch && (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => setSearchQuery('')}
                >
                  Xóa
                </button>
              )}
            </div>

            {allParentIds.length > 0 && !hasSearch && (
              <div className={styles.toolbarGroup} role="group" aria-label="Mở hoặc thu gọn cây">
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${!allCollapsed ? styles.toolbarBtnActive : ''}`}
                  onClick={expandAll}
                >
                  Mở hết
                </button>
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${allCollapsed ? styles.toolbarBtnActive : ''}`}
                  onClick={collapseAll}
                >
                  Thu gọn
                </button>
              </div>
            )}
          </div>

          {filteredCategories.length === 0 ? (
            <div className={styles.emptySearch} role="status">
              <p>Không tìm thấy danh mục phù hợp với “{trimmedSearch}”.</p>
              <button type="button" className="button-secondary" onClick={() => setSearchQuery('')}>
                Xóa tìm kiếm
              </button>
            </div>
          ) : (
            <div className={styles.treeContainer}>
              <table className={styles.treeTable}>
                <thead>
                  <tr>
                    <th scope="col">Tên danh mục</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col" className={styles.countColumn}>
                      Sản phẩm trực tiếp
                    </th>
                    <th scope="col" className={styles.countColumn}>
                      Tổng cả nhánh
                    </th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((root) => {
                    const rootBadge = categoryVisibilityBadge(root);
                    const hasChildren = root.children.length > 0;
                    // Khi đang tìm kiếm, tự động mở nhánh có con khớp mà không ghi đè state collapsedIds
                    const isExpanded = hasSearch ? true : !collapsedIds.has(root.id);

                    return (
                      <Fragment key={root.id}>
                        <tr className={styles.rootRow} data-testid={`category-row-${root.slug}`}>
                          <td data-label="Tên danh mục">
                            <div className={styles.categoryNameCell}>
                              {hasChildren ? (
                                <button
                                  type="button"
                                  className={styles.expandButton}
                                  aria-expanded={isExpanded}
                                  aria-label={
                                    isExpanded
                                      ? `Thu gọn nhánh ${root.name}`
                                      : `Mở nhánh ${root.name}`
                                  }
                                  onClick={() => toggleBranch(root.id)}
                                  disabled={hasSearch}
                                >
                                  {isExpanded ? '⌄' : '›'}
                                </button>
                              ) : (
                                <span className={styles.expandSpacer} aria-hidden="true" />
                              )}
                              <div className={styles.categoryNameContent}>
                                <Link
                                  to={`/admin/categories/${encodeURIComponent(root.id)}`}
                                  className={styles.categoryLink}
                                >
                                  {root.name}
                                </Link>
                                <span className={styles.categorySlug}>/{root.slug}</span>
                              </div>
                            </div>
                          </td>
                          <td data-label="Trạng thái">
                            <span
                              className={`${styles.badge} ${
                                rootBadge.variant === 'active'
                                  ? styles.badgeActive
                                  : styles.badgeHidden
                              }`}
                            >
                              <span className={styles.badgeDot} aria-hidden="true" />
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
                              <Link
                                to={`/admin/categories/${encodeURIComponent(root.id)}`}
                                className={styles.detailLink}
                              >
                                Chi tiết
                              </Link>
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

                        {isExpanded &&
                          root.children.map((child) => {
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
                                    <div className={styles.categoryNameContent}>
                                      <Link
                                        to={`/admin/categories/${encodeURIComponent(child.id)}`}
                                        className={styles.categoryLink}
                                      >
                                        {child.name}
                                      </Link>
                                      <span className={styles.categorySlug}>/{child.slug}</span>
                                    </div>
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
                                    <span className={styles.badgeDot} aria-hidden="true" />
                                    {childBadge.text}
                                  </span>
                                </td>
                                <td data-label="Sản phẩm trực tiếp" className={styles.countColumn}>
                                  <span className={styles.countValue}>{child.productCount}</span>
                                </td>
                                <td data-label="Tổng cả nhánh" className={styles.countColumn}>
                                  <span className={styles.countValue}>
                                    {child.subtreeProductCount}
                                  </span>
                                </td>
                                <td data-label="Thao tác">
                                  <div className={styles.actions}>
                                    <Link
                                      to={`/admin/categories/${encodeURIComponent(child.id)}`}
                                      className={styles.detailLink}
                                    >
                                      Chi tiết
                                    </Link>
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
        </>
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
