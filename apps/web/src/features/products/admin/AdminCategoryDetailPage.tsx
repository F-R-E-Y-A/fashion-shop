import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { cartKeys } from '@/features/cart';
import { ConfirmDialog, Loading } from '@/ui';

import { adminCatalogKeys } from './admin-catalog.api.js';
import {
  adminCategoriesKeys,
  type AdminCategoryDetail,
  type AdminCategoryNode,
  CATEGORY_MAX_INT32,
  categoryErrorText,
  categoryMutationErrorText,
  categoryVisibilityBadge,
  type UncertainEditCategoryState,
  type UpdateAdminCategoryPayload,
} from './admin-categories.api.js';
import styles from './AdminCategories.module.css';
import {
  categoryRequest,
  nextCategoryOperationId,
  useCategoryViewActive,
} from './category-request-lifecycle.js';
import { useCategoryVisibilityAction } from './category-visibility-action.js';

export function AdminCategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, getSessionEpoch } = useAuth();
  return (
    <AdminCategoryDetailPageScope key={`${user?.id ?? ''}:${getSessionEpoch()}:${id ?? ''}`} />
  );
}

function AdminCategoryDetailPageScope() {
  const viewActive = useCategoryViewActive();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);
  const queryClient = useQueryClient();

  const { busy, notice, noticeRef, checking, recheck, clearNotice, requestToggle, dialogProps } =
    useCategoryVisibilityAction();

  const query = useQuery({
    queryKey: adminCategoriesKeys.detail(actor, id ?? ''),
    enabled: Boolean(actor && id) && !forbidden,
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminCategoryDetail>(`/admin/categories/${encodeURIComponent(id ?? '')}`, {
          signal,
        }),
      ),
    retry: shouldRetryAdminQuery,
  });

  const treeQuery = useQuery({
    queryKey: adminCategoriesKeys.tree(actor),
    enabled: Boolean(actor) && !forbidden,
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminCategoryNode[]>('/admin/categories', { signal })),
    retry: shouldRetryAdminQuery,
  });

  const uncertainKey = adminCategoriesKeys.uncertainEdit(actor, epoch, id ?? '');
  const uncertainQuery = useQuery<UncertainEditCategoryState | null>({
    queryKey: uncertainKey,
    queryFn: () =>
      queryClient.getQueryData<UncertainEditCategoryState | null>(uncertainKey) ?? null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const uncertainEdit = uncertainQuery.data ?? null;

  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [sortOrderInput, setSortOrderInput] = useState('0');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [hydratedKey, setHydratedKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [recheckingEdit, setRecheckingEdit] = useState(false);
  const [conflictStale, setConflictStale] = useState(false);
  const [editNotice, setEditNotice] = useState<{ error?: boolean; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; sortOrder?: string }>({});
  const editNoticeRef = useRef<HTMLDivElement>(null);

  const createdMessage =
    (location.state as { createdMessage?: string } | null)?.createdMessage ?? null;

  const category = query.data;
  const rootCategories = useMemo(
    () => (treeQuery.data ?? []).filter((node) => node.id !== id),
    [treeQuery.data, id],
  );

  const nextHydratedKey = category ? `${category.id}:${category.updatedAt}` : '';
  if (category && nextHydratedKey !== hydratedKey && (!dirty || hydratedKey === '')) {
    setHydratedKey(nextHydratedKey);
    setName(category.name);
    setParentId(category.parentId ?? '');
    setSortOrderInput(String(category.sortOrder));
    setBaseUpdatedAt(category.updatedAt);
    if (hydratedKey === '') {
      setDirty(false);
    }
  }

  useEffect(() => {
    if (editNotice) {
      editNoticeRef.current?.focus();
    }
  }, [editNotice]);

  if (forbidden) return <AdminForbidden />;

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
  const hasChildren = category.children.length > 0;

  const invalidateAllCategoryCaches = async (
    actorAtCall: string,
    isCurrent: () => boolean,
  ): Promise<boolean> => {
    await queryClient.cancelQueries({ queryKey: adminCategoriesKeys.all(actorAtCall) });
    if (!isCurrent()) return false;
    await queryClient.invalidateQueries({ queryKey: adminCategoriesKeys.all(actorAtCall) });
    if (!isCurrent()) return false;
    await queryClient.invalidateQueries({ queryKey: adminCatalogKeys.all(actorAtCall) });
    if (!isCurrent()) return false;
    await queryClient.invalidateQueries({ queryKey: ['categories'] });
    if (!isCurrent()) return false;
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    if (!isCurrent()) return false;
    await queryClient.invalidateQueries({ queryKey: cartKeys.all });
    return isCurrent();
  };

  const resetDraftToServer = () => {
    setName(category.name);
    setParentId(category.parentId ?? '');
    setSortOrderInput(String(category.sortOrder));
    setBaseUpdatedAt(category.updatedAt);
    setHydratedKey(`${category.id}:${category.updatedAt}`);
    setDirty(false);
    setConflictStale(false);
    setFieldErrors({});
    setEditNotice({ text: 'Đã tải lại thông tin mới nhất từ máy chủ.' });
  };

  const handleSave = async (event: React.FormEvent) => {
    if (queryClient.getQueryData<UncertainEditCategoryState>(uncertainKey)?.status === 'pending')
      return;
    event.preventDefault();
    if (saving || recheckingEdit || !id || conflictStale || uncertainEdit?.status === 'pending')
      return;

    const trimmedName = name.trim();
    const parsedSortOrder = Number(sortOrderInput.trim() === '' ? '0' : sortOrderInput.trim());
    const nextErrors: { name?: string; sortOrder?: string } = {};

    if (!trimmedName || trimmedName.length > 120) {
      nextErrors.name = 'Tên danh mục phải từ 1 đến 120 ký tự.';
    }
    if (
      !Number.isInteger(parsedSortOrder) ||
      parsedSortOrder < 0 ||
      parsedSortOrder > CATEGORY_MAX_INT32
    ) {
      nextErrors.sortOrder = `Thứ tự phải là số nguyên từ 0 đến ${CATEGORY_MAX_INT32}.`;
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setEditNotice({ error: true, text: 'Vui lòng kiểm tra lại các trường thông tin bên dưới.' });
      return;
    }

    const payload: UpdateAdminCategoryPayload = {
      name: trimmedName,
      parentId: hasChildren ? category.parentId : parentId || null,
      sortOrder: parsedSortOrder,
      expectedUpdatedAt: baseUpdatedAt || category.updatedAt,
    };

    const actorAtCall = actor;
    const epochAtCall = getSessionEpoch();
    const accessAtCall = adminAccessGeneration(queryClient, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(queryClient, actorAtCall) === accessAtCall;

    setSaving(true);
    setEditNotice(null);
    setConflictStale(false);

    const operationId = nextCategoryOperationId();
    queryClient.setQueryData<UncertainEditCategoryState | null>(uncertainKey, () => ({
      operationId,
      id,
      payload,
      status: 'pending',
      recheckedUnconfirmed: false,
    }));

    try {
      const updated = await categoryRequest((signal) =>
        request<AdminCategoryDetail>(`/admin/categories/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          signal,
          body: payload,
        }),
      );

      if (
        !isCurrent() ||
        queryClient.getQueryData<UncertainEditCategoryState>(uncertainKey)?.operationId !==
          operationId
      )
        return;

      queryClient.setQueryData<UncertainEditCategoryState | null>(
        adminCategoriesKeys.uncertainEdit(actorAtCall, epochAtCall, id),
        null,
      );
      queryClient.setQueryData(adminCategoriesKeys.detail(actorAtCall, id), updated);
      if (!viewActive()) {
        await invalidateAllCategoryCaches(actorAtCall, isCurrent);
        return;
      }
      setName(updated.name);
      setParentId(updated.parentId ?? '');
      setSortOrderInput(String(updated.sortOrder));
      setBaseUpdatedAt(updated.updatedAt);
      setHydratedKey(`${updated.id}:${updated.updatedAt}`);
      setDirty(false);

      const stillCurrent = await invalidateAllCategoryCaches(actorAtCall, isCurrent);
      if (!stillCurrent || !viewActive()) return;

      setEditNotice({ text: `Đã lưu cập nhật cho danh mục "${updated.name}".` });
    } catch (error) {
      if (
        !isCurrent() ||
        queryClient.getQueryData<UncertainEditCategoryState>(uncertainKey)?.operationId !==
          operationId
      )
        return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status === 409) {
        queryClient.setQueryData<UncertainEditCategoryState | null>(uncertainKey, null);
        if (!viewActive()) return;
        setConflictStale(true);
        setDirty(true);
        setEditNotice({ error: true, text: categoryMutationErrorText(error) });
        await invalidateAllCategoryCaches(actorAtCall, isCurrent);
      } else if (status >= 400 && status < 500) {
        queryClient.setQueryData<UncertainEditCategoryState | null>(uncertainKey, null);
        if (!viewActive()) return;
        setEditNotice({ error: true, text: categoryMutationErrorText(error) });
      } else {
        queryClient.setQueryData<UncertainEditCategoryState | null>(uncertainKey, () => ({
          operationId,
          id,
          payload,
          status: 'uncertain',
          recheckedUnconfirmed: false,
        }));
        if (!viewActive()) return;
        setEditNotice({
          error: true,
          text: 'Không thể xác nhận kết quả lưu thay đổi từ máy chủ. Hãy kiểm tra lại trạng thái trước khi thao tác tiếp.',
        });
      }
    } finally {
      if (isCurrent() && viewActive()) {
        setSaving(false);
      }
    }
  };

  const handleRecheckEdit = async () => {
    if (!uncertainEdit || !id || recheckingEdit || saving) return;
    const actorAtCall = actor;
    const epochAtCall = getSessionEpoch();
    const accessAtCall = adminAccessGeneration(queryClient, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(queryClient, actorAtCall) === accessAtCall;
    const ownsRecheck = () =>
      isCurrent() &&
      queryClient.getQueryData<UncertainEditCategoryState>(uncertainKey)?.operationId ===
        uncertainEdit.operationId;

    setRecheckingEdit(true);
    try {
      const detail = await guardQuery(() =>
        categoryRequest((signal) =>
          request<AdminCategoryDetail>(`/admin/categories/${encodeURIComponent(id)}`, { signal }),
        ),
      );
      if (!ownsRecheck()) return;

      queryClient.setQueryData(adminCategoriesKeys.detail(actorAtCall, id), detail);
      const stillCurrent = await invalidateAllCategoryCaches(actorAtCall, isCurrent);
      if (!stillCurrent || !ownsRecheck()) return;

      const applied =
        detail.name === uncertainEdit.payload.name &&
        detail.parentId === (uncertainEdit.payload.parentId ?? null) &&
        detail.sortOrder === uncertainEdit.payload.sortOrder;

      queryClient.setQueryData<UncertainEditCategoryState | null>(uncertainKey, null);
      if (!viewActive()) return;
      if (applied) {
        setBaseUpdatedAt(detail.updatedAt);
        setConflictStale(false);
        setName(detail.name);
        setParentId(detail.parentId ?? '');
        setSortOrderInput(String(detail.sortOrder));
        setHydratedKey(`${detail.id}:${detail.updatedAt}`);
        setDirty(false);
        setEditNotice({ text: 'Đã đối chiếu: thay đổi của bạn đã được lưu trên máy chủ.' });
      } else {
        setConflictStale(detail.updatedAt !== uncertainEdit.payload.expectedUpdatedAt);
        setEditNotice({
          error: true,
          text: 'Đã đối chiếu: máy chủ chưa phản ánh thay đổi vừa gửi. Bản nháp của bạn vẫn được giữ nguyên để kiểm tra và lưu lại.',
        });
      }
    } catch (error) {
      if (!ownsRecheck() || !viewActive()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }
      setEditNotice({ error: true, text: categoryErrorText(error, 'detail') });
    } finally {
      if (isCurrent() && viewActive()) {
        setRecheckingEdit(false);
      }
    }
  };

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

      {createdMessage && !editNotice && (
        <div className={`${styles.notice} ${styles.noticeSuccess}`} role="status">
          <span>{createdMessage}</span>
        </div>
      )}

      {editNotice && (
        <div
          ref={editNoticeRef}
          tabIndex={-1}
          className={`${styles.notice} ${editNotice.error ? styles.noticeError : styles.noticeSuccess}`}
          role={editNotice.error ? 'alert' : 'status'}
          aria-live="polite"
          data-testid="edit-category-notice"
        >
          <span>{editNotice.text}</span>
          <div className={styles.noticeActions}>
            {uncertainEdit && (
              <button
                type="button"
                className={styles.recheckButton}
                disabled={recheckingEdit || saving}
                onClick={() => void handleRecheckEdit()}
                data-testid="recheck-edit-btn"
              >
                {recheckingEdit ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
              </button>
            )}
            {conflictStale && (
              <button
                type="button"
                className={styles.recheckButton}
                onClick={resetDraftToServer}
                data-testid="reload-latest-category-btn"
              >
                Tải lại dữ liệu mới nhất trên máy chủ
              </button>
            )}
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setEditNotice(null)}
              aria-label="Đóng thông báo chỉnh sửa"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      <form className={styles.detailCard} onSubmit={(e) => void handleSave(e)} noValidate>
        <h2 style={{ fontSize: '1.125rem', margin: '0 0 1rem 0' }}>Chỉnh sửa danh mục</h2>
        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label htmlFor="edit-category-name" className={styles.formLabel}>
              Tên danh mục *
            </label>
            <input
              id="edit-category-name"
              name="name"
              type="text"
              className={styles.formInput}
              value={name}
              disabled={saving || recheckingEdit || uncertainEdit?.status === 'pending'}
              maxLength={120}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
              required
            />
            {fieldErrors.name && (
              <p className={styles.formError} role="alert">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className={styles.formField}>
            <span className={styles.formLabel}>Slug (bất biến)</span>
            <div className={styles.readonlyValue} data-testid="edit-category-slug-readonly">
              {category.slug}
            </div>
            <p className={styles.formHint}>
              Slug không thể thay đổi sau khi tạo để giữ ổn định đường dẫn cửa hàng.
            </p>
          </div>

          <div className={styles.formField}>
            <label htmlFor="edit-category-parent" className={styles.formLabel}>
              Danh mục cha (cấp 1)
            </label>
            <select
              id="edit-category-parent"
              name="parentId"
              className={styles.formSelect}
              value={parentId}
              disabled={
                saving || recheckingEdit || hasChildren || uncertainEdit?.status === 'pending'
              }
              onChange={(e) => {
                setParentId(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">Không có (danh mục gốc cấp 1)</option>
              {rootCategories.map((root) => {
                const blockedByProducts = root.productCount > 0 && root.id !== category.parentId;
                return (
                  <option key={root.id} value={root.id} disabled={blockedByProducts}>
                    {root.name}
                    {blockedByProducts
                      ? ` — Đang có ${root.productCount} sản phẩm trực tiếp (không thể làm cha)`
                      : ''}
                  </option>
                );
              })}
            </select>
            {hasChildren ? (
              <p className={styles.formHint}>
                Danh mục này đang có {category.children.length} danh mục con nên không thể chuyển
                thành danh mục con (giới hạn cây 2 cấp).
              </p>
            ) : (
              <p className={styles.formHint}>
                Chọn "Không có" để đưa lên cấp 1, hoặc chọn danh mục gốc chưa có sản phẩm trực tiếp.
              </p>
            )}
          </div>

          <div className={styles.formField}>
            <label htmlFor="edit-category-sort-order" className={styles.formLabel}>
              Thứ tự sắp xếp
            </label>
            <input
              id="edit-category-sort-order"
              name="sortOrder"
              type="number"
              min={0}
              max={CATEGORY_MAX_INT32}
              step={1}
              className={styles.formInput}
              value={sortOrderInput}
              disabled={saving || recheckingEdit || uncertainEdit?.status === 'pending'}
              onChange={(e) => {
                setSortOrderInput(e.target.value);
                setDirty(true);
                if (fieldErrors.sortOrder) {
                  setFieldErrors((prev) => ({ ...prev, sortOrder: undefined }));
                }
              }}
            />
            {fieldErrors.sortOrder && (
              <p className={styles.formError} role="alert">
                {fieldErrors.sortOrder}
              </p>
            )}
          </div>
        </div>

        <div className={styles.formActions}>
          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={
              saving || recheckingEdit || conflictStale || uncertainEdit?.status === 'pending'
            }
            data-testid="submit-save-category"
          >
            {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>

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
                    <td data-label="Tên danh mục con">
                      <Link
                        to={`/admin/categories/${encodeURIComponent(child.id)}`}
                        className={styles.categoryLink}
                      >
                        {child.name}
                      </Link>
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
                    <td data-label="Sản phẩm trực tiếp">{child.productCount}</td>
                    <td data-label="Chi tiết" style={{ textAlign: 'right' }}>
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
