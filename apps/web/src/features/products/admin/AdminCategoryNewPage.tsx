import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

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
import { Loading } from '@/ui';

import { adminCatalogKeys } from './admin-catalog.api.js';
import {
  adminCategoriesKeys,
  type AdminCategoryDetail,
  type AdminCategoryNode,
  CATEGORY_MAX_INT32,
  CATEGORY_SLUG_REGEX,
  categoryErrorText,
  categoryMutationErrorText,
  type CreateAdminCategoryPayload,
  doesCategoryMatchCreatePayload,
  type NormalizedCreateCategoryPayload,
  slugifyCategoryName,
  type UncertainCreateCategoryState,
} from './admin-categories.api.js';
import styles from './AdminCategories.module.css';
import {
  categoryRequest,
  nextCategoryOperationId,
  useCategoryViewActive,
} from './category-request-lifecycle.js';

function createClientUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function AdminCategoryNewPage() {
  const { user, getSessionEpoch } = useAuth();
  return <AdminCategoryNewPageScope key={`${user?.id ?? ''}:${getSessionEpoch()}`} />;
}

function AdminCategoryNewPageScope() {
  const viewActive = useCategoryViewActive();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const uncertainKey = adminCategoriesKeys.uncertainCreate(actor, epoch);
  const uncertainQuery = useQuery<UncertainCreateCategoryState | null>({
    queryKey: uncertainKey,
    queryFn: () =>
      queryClient.getQueryData<UncertainCreateCategoryState | null>(uncertainKey) ?? null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const uncertain = uncertainQuery.data ?? null;

  const treeQuery = useQuery({
    queryKey: adminCategoriesKeys.tree(actor),
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminCategoryNode[]>('/admin/categories', { signal })),
    enabled: Boolean(actor) && !forbidden,
    retry: shouldRetryAdminQuery,
  });

  const [name, setName] = useState(() => uncertain?.payload.name ?? '');
  const [slugInput, setSlugInput] = useState(() => uncertain?.payload.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(() => Boolean(uncertain?.payload.slug));
  const [parentId, setParentId] = useState<string>(() => uncertain?.payload.parentId ?? '');
  const [sortOrderInput, setSortOrderInput] = useState(() =>
    uncertain ? String(uncertain.payload.sortOrder) : '0',
  );
  const [syncedUncertainId, setSyncedUncertainId] = useState<string | null>(
    () => uncertain?.id ?? null,
  );

  if (uncertain && syncedUncertainId !== uncertain.id) {
    setSyncedUncertainId(uncertain.id);
    setName(uncertain.payload.name);
    setSlugInput(uncertain.payload.slug);
    setSlugTouched(true);
    setParentId(uncertain.payload.parentId ?? '');
    setSortOrderInput(String(uncertain.payload.sortOrder));
  }

  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ error?: boolean; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    slug?: string;
    sortOrder?: string;
  }>({});
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (notice) {
      noticeRef.current?.focus();
    }
  }, [notice]);

  const rootCategories = useMemo(() => treeQuery.data ?? [], [treeQuery.data]);
  const derivedSlug = slugTouched ? slugInput : slugifyCategoryName(name);

  if (forbidden) {
    return <AdminForbidden />;
  }

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

  const executeCreate = async (id: string, normalized: NormalizedCreateCategoryPayload) => {
    const actorAtCall = actor;
    const epochAtCall = getSessionEpoch();
    const accessAtCall = adminAccessGeneration(queryClient, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(queryClient, actorAtCall) === accessAtCall;

    setSubmitting(true);
    setNotice(null);

    const operationId = nextCategoryOperationId();
    queryClient.setQueryData<UncertainCreateCategoryState | null>(uncertainKey, () => ({
      operationId,
      id,
      payload: normalized,
      status: 'pending',
      recheckedNotFound: false,
    }));

    try {
      const body: CreateAdminCategoryPayload = {
        id,
        name: normalized.name,
        slug: normalized.slug,
        parentId: normalized.parentId,
        sortOrder: normalized.sortOrder,
      };
      const created = await categoryRequest((signal) =>
        request<AdminCategoryDetail>('/admin/categories', {
          method: 'POST',
          signal,
          body,
        }),
      );

      if (
        !isCurrent() ||
        queryClient.getQueryData<UncertainCreateCategoryState>(uncertainKey)?.operationId !==
          operationId
      )
        return;

      queryClient.setQueryData<UncertainCreateCategoryState | null>(
        adminCategoriesKeys.uncertainCreate(actorAtCall, epochAtCall),
        null,
      );
      const stillCurrent = await invalidateAllCategoryCaches(actorAtCall, isCurrent);
      if (!stillCurrent) return;

      if (viewActive() && location.pathname === '/admin/categories/new') {
        navigate(`/admin/categories/${encodeURIComponent(created.id)}`, {
          replace: true,
          state: { createdMessage: `Đã tạo danh mục "${created.name}" ở trạng thái đang ẩn.` },
        });
      }
    } catch (error) {
      if (
        !isCurrent() ||
        queryClient.getQueryData<UncertainCreateCategoryState>(uncertainKey)?.operationId !==
          operationId
      )
        return;

      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      if (status >= 400 && status < 500) {
        queryClient.setQueryData<UncertainCreateCategoryState | null>(uncertainKey, null);
        if (!viewActive()) return;
        setNotice({ error: true, text: categoryMutationErrorText(error) });
      } else {
        queryClient.setQueryData<UncertainCreateCategoryState | null>(uncertainKey, () => ({
          operationId,
          id,
          payload: normalized,
          status: 'uncertain',
          recheckedNotFound: false,
        }));
        if (!viewActive()) return;
        setNotice({
          error: true,
          text: 'Không thể xác nhận kết quả tạo danh mục từ máy chủ. Hãy kiểm tra lại trạng thái trước khi tạo mới.',
        });
      }
    } finally {
      if (isCurrent() && viewActive()) {
        setSubmitting(false);
      }
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    if (queryClient.getQueryData<UncertainCreateCategoryState>(uncertainKey)?.status === 'pending')
      return;
    event.preventDefault();
    if (submitting || checking || uncertain?.status === 'pending') return;

    if (uncertain) {
      void executeCreate(uncertain.id, uncertain.payload);
      return;
    }

    const trimmedName = name.trim();
    const trimmedSlug = (slugTouched ? slugInput : slugifyCategoryName(trimmedName)).trim();
    const parsedSortOrder = Number(sortOrderInput.trim() === '' ? '0' : sortOrderInput.trim());

    const nextErrors: { name?: string; slug?: string; sortOrder?: string } = {};
    if (!trimmedName || trimmedName.length > 120) {
      nextErrors.name = 'Tên danh mục phải từ 1 đến 120 ký tự.';
    }
    if (!trimmedSlug || trimmedSlug.length > 140 || !CATEGORY_SLUG_REGEX.test(trimmedSlug)) {
      nextErrors.slug = 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (-).';
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
      setNotice({ error: true, text: 'Vui lòng kiểm tra lại các trường thông tin bên dưới.' });
      return;
    }

    const normalized: NormalizedCreateCategoryPayload = {
      name: trimmedName,
      slug: trimmedSlug,
      parentId: parentId || null,
      sortOrder: parsedSortOrder,
    };

    void executeCreate(createClientUuid(), normalized);
  };

  const handleRecheck = async () => {
    if (!uncertain || checking || submitting) return;
    const actorAtCall = actor;
    const epochAtCall = getSessionEpoch();
    const accessAtCall = adminAccessGeneration(queryClient, actorAtCall);
    const isCurrent = () =>
      getSessionEpoch() === epochAtCall &&
      adminAccessGeneration(queryClient, actorAtCall) === accessAtCall;
    const ownsRecheck = () =>
      isCurrent() &&
      queryClient.getQueryData<UncertainCreateCategoryState>(uncertainKey)?.operationId ===
        uncertain.operationId;

    setChecking(true);
    try {
      const detail = await guardQuery(() =>
        categoryRequest((signal) =>
          request<AdminCategoryDetail>(`/admin/categories/${encodeURIComponent(uncertain.id)}`, {
            signal,
          }),
        ),
      );
      if (!ownsRecheck() || !viewActive()) return;

      const matches = doesCategoryMatchCreatePayload(detail, uncertain.payload);
      if (!matches) {
        setNotice({
          error: true,
          text: `Danh mục trên máy chủ ("${detail.name}", slug: "${detail.slug}") không khớp với yêu cầu đã gửi ("${uncertain.payload.name}", slug: "${uncertain.payload.slug}").`,
        });
        return;
      }

      queryClient.setQueryData<UncertainCreateCategoryState | null>(uncertainKey, null);
      const stillCurrent = await invalidateAllCategoryCaches(actorAtCall, isCurrent);
      if (!stillCurrent) return;

      navigate(`/admin/categories/${encodeURIComponent(detail.id)}`, {
        replace: true,
        state: {
          createdMessage: `Đã xác nhận danh mục "${detail.name}" đã được tạo trên máy chủ.`,
        },
      });
    } catch (error) {
      if (!ownsRecheck() || !viewActive()) return;
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        markForbidden();
        return;
      }
      if (classifyRequestError(error, 'detail') === 'not-found') {
        queryClient.setQueryData<UncertainCreateCategoryState | null>(uncertainKey, () => ({
          ...uncertain,
          recheckedNotFound: true,
        }));
        setNotice({
          error: true,
          text: 'Chưa thấy danh mục trên máy chủ (404), nhưng yêu cầu trước đó vẫn có thể hoàn tất muộn. Bạn có thể bấm "Gửi lại với cùng mã" để thử lại an toàn.',
        });
      } else {
        setNotice({
          error: true,
          text: categoryErrorText(error, 'detail'),
        });
      }
    } finally {
      if (isCurrent() && viewActive()) {
        setChecking(false);
      }
    }
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Đường dẫn điều hướng">
        <Link to="/admin/categories" className={styles.breadcrumbLink}>
          Danh mục
        </Link>
        <span aria-hidden="true">/</span>
        <span>Tạo danh mục mới</span>
      </nav>

      <header className={styles.header}>
        <p className={styles.eyebrow}>Phân loại sản phẩm</p>
        <h1 className={styles.title}>Tạo danh mục mới</h1>
        <p className={styles.description}>
          Danh mục mới được tạo ở trạng thái <strong>Đang ẩn</strong> mặc định để kiểm tra cấu trúc
          trước khi bật hiển thị trên cửa hàng.
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
          <div className={styles.noticeActions}>
            {uncertain && (
              <button
                type="button"
                className={styles.recheckButton}
                disabled={checking || submitting}
                onClick={() => void handleRecheck()}
                data-testid="recheck-create-btn"
              >
                {checking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
              </button>
            )}
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setNotice(null)}
              aria-label="Đóng thông báo"
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {uncertain && !notice && (
        <div
          className={`${styles.notice} ${styles.noticeError}`}
          role="alert"
          data-testid="uncertain-create-banner"
        >
          <span>
            {uncertain.status === 'pending'
              ? 'Đang gửi yêu cầu tạo danh mục lên máy chủ…'
              : uncertain.recheckedNotFound
                ? 'Chưa thấy danh mục trên máy chủ (404). Hãy gửi lại bằng đúng mã yêu cầu cũ để tránh tạo trùng.'
                : 'Đang có yêu cầu tạo danh mục chưa rõ kết quả. Hãy kiểm tra lại trạng thái trên máy chủ trước khi tạo mới.'}
          </span>
          <div className={styles.noticeActions}>
            <button
              type="button"
              className={styles.recheckButton}
              disabled={checking || submitting}
              onClick={() => void handleRecheck()}
              data-testid="recheck-create-btn"
            >
              {checking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
            </button>
          </div>
        </div>
      )}

      {treeQuery.isLoading && <Loading label="Đang tải danh sách danh mục cha…" />}

      {treeQuery.isError && !forbidden && (
        <div className={styles.errorBox} role="alert">
          <p>{categoryErrorText(treeQuery.error, 'list')}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => void treeQuery.refetch()}
          >
            Thử lại
          </button>
        </div>
      )}

      {!treeQuery.isLoading && !treeQuery.isError && (
        <form className={styles.detailCard} onSubmit={handleSubmit} noValidate>
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label htmlFor="category-name" className={styles.formLabel}>
                Tên danh mục *
              </label>
              <input
                id="category-name"
                name="name"
                type="text"
                className={styles.formInput}
                value={name}
                disabled={submitting || Boolean(uncertain)}
                maxLength={120}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder="Ví dụ: Áo khoác len"
                required
              />
              {fieldErrors.name && (
                <p className={styles.formError} role="alert">
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className={styles.formField}>
              <label htmlFor="category-slug" className={styles.formLabel}>
                Slug (cố định sau khi tạo)
              </label>
              <input
                id="category-slug"
                name="slug"
                type="text"
                className={styles.formInput}
                value={derivedSlug}
                disabled={submitting || Boolean(uncertain)}
                maxLength={140}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlugInput(e.target.value);
                  if (fieldErrors.slug) setFieldErrors((prev) => ({ ...prev, slug: undefined }));
                }}
                placeholder="ao-khoac-len"
              />
              <p className={styles.formHint}>
                Tự sinh từ tên nếu không sửa. Sau khi tạo, slug không thể đổi để giữ ổn định URL.
              </p>
              {fieldErrors.slug && (
                <p className={styles.formError} role="alert">
                  {fieldErrors.slug}
                </p>
              )}
            </div>

            <div className={styles.formField}>
              <label htmlFor="category-sort-order" className={styles.formLabel}>
                Thứ tự sắp xếp
              </label>
              <input
                id="category-sort-order"
                name="sortOrder"
                type="number"
                min={0}
                max={CATEGORY_MAX_INT32}
                step={1}
                className={styles.formInput}
                value={sortOrderInput}
                disabled={submitting || Boolean(uncertain)}
                onChange={(e) => {
                  setSortOrderInput(e.target.value);
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

            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label htmlFor="category-parent" className={styles.formLabel}>
                Danh mục cha (cấp 1)
              </label>
              <select
                id="category-parent"
                name="parentId"
                className={styles.formSelect}
                value={parentId}
                disabled={submitting || Boolean(uncertain)}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">Không có (tạo làm danh mục gốc cấp 1)</option>
                {rootCategories.map((root) => {
                  const hasDirectProducts = root.productCount > 0;
                  return (
                    <option key={root.id} value={root.id} disabled={hasDirectProducts}>
                      {root.name}
                      {hasDirectProducts
                        ? ` — Đang có ${root.productCount} sản phẩm trực tiếp (không thể làm cha)`
                        : ''}
                    </option>
                  );
                })}
              </select>
              <p className={styles.formHint}>
                Hệ thống hỗ trợ tối đa 2 cấp. Danh mục đã có sản phẩm trực tiếp không thể chứa danh
                mục con.
              </p>
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={submitting || checking || uncertain?.status === 'pending'}
              data-testid="submit-create-category"
            >
              {submitting || uncertain?.status === 'pending'
                ? 'Đang tạo…'
                : uncertain
                  ? 'Gửi lại với cùng mã'
                  : 'Tạo danh mục (ẩn mặc định)'}
            </button>
            <Link to="/admin/categories" className={styles.secondaryBtn}>
              Quay lại danh sách
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
