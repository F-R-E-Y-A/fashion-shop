import {
  type QueryClient,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ActionFeedback, ConfirmDialog } from '@/ui';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  type ChangeProductContentInput,
  type ProductContentResult,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

const contentLocks = new WeakMap<object, Set<string>>();

export type ContentField = 'name' | 'description' | 'material' | 'careInstructions';
const CONTENT_FIELDS: readonly ContentField[] = [
  'name',
  'description',
  'material',
  'careInstructions',
];

export type ContentTarget = Pick<
  AdminCatalogDetail,
  'id' | 'name' | 'description' | 'material' | 'careInstructions' | 'contentVersion'
>;

export interface ContentDraft {
  name: string;
  description: string;
  material: string;
  careInstructions: string;
  expectedVersion: number;
}

type FieldConflicts = Partial<Record<ContentField, { serverValue: string | null }>>;
type ContentNotice = { text: string; error?: boolean; recheck?: boolean };

function normalizeDraftField(field: ContentField, value: string): string | null {
  const trimmed = value.trim();
  return field === 'name' ? trimmed : trimmed || null;
}

function hasNewerContent(client: QueryClient, actor: string, updated: ProductContentResult) {
  return client
    .getQueriesData<AdminCatalogDetail>({
      queryKey: adminCatalogKeys.detail(actor, updated.id),
    })
    .some(([, data]) => data && data.contentVersion > updated.contentVersion);
}

export function useProductContentAction() {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const [target, setTarget] = useState<ContentTarget | null>(null);
  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const draftRef = useRef<ContentDraft | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ContentField, string>>>({});
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [fieldConflicts, setFieldConflicts] = useState<FieldConflicts>({});
  const [notice, setNotice] = useState<(ContentNotice & { key: number; scope: string }) | null>(
    null,
  );
  const noticeIdRef = useRef(0);
  const sessionScope = `${actor}:${epoch}`;
  const scopedNotice = notice?.scope === sessionScope ? notice : null;

  const checkKey = [...adminCatalogKeys.all(actor), 'uncertain-content', epoch];
  const check = useQuery<ContentTarget | null>({
    queryKey: checkKey,
    queryFn: () => null,
    enabled: false,
  });
  const needsCheck = check.data ?? null;
  const setNeedsCheck = (value: ContentTarget | null) => client.setQueryData(checkKey, value);

  const [checking, setChecking] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [focus, setFocus] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const opened = useRef(false);
  const reloadSeq = useRef(0);

  const mutationKey = [...adminCatalogKeys.all(actor), 'content', epoch];
  const busy = useIsMutating({ mutationKey }) > 0;

  useEffect(() => {
    if (focus) noticeRef.current?.focus();
  }, [focus]);

  const clearNotice = useCallback(() => setNotice(null), []);
  const showNotice = (next: ContentNotice) => {
    noticeIdRef.current += 1;
    setNotice({ ...next, key: noticeIdRef.current, scope: sessionScope });
  };

  const current = (v: { epoch: number; access: number }) =>
    getSessionEpoch() === v.epoch && adminAccessGeneration(client, actor) === v.access;
  const stamp = () => ({ epoch: getSessionEpoch(), access: adminAccessGeneration(client, actor) });

  const resetModal = () => {
    reloadSeq.current += 1;
    draftRef.current = null;
    setTarget(null);
    setDraft(null);
    setErrors({});
    setConflictError(null);
    setFieldConflicts({});
    setReloading(false);
  };

  const finish = (next: ContentNotice) => {
    showNotice(next);
    resetModal();
    if (opened.current || !opener.current?.isConnected) {
      opened.current = false;
      if (next.error) setFocus((n) => n + 1);
    }
  };

  const refreshLists = () => client.resetQueries({ queryKey: adminCatalogKeys.lists(actor) });

  function validate(d: ContentDraft) {
    const errs: Partial<Record<ContentField, string>> = {};
    const trimmedName = d.name.trim();
    if (!trimmedName) errs.name = 'Tên sản phẩm không được để trống.';
    else if (trimmedName.length > 200) errs.name = 'Tên tối đa 200 ký tự.';
    if (d.description.length > 20000) errs.description = 'Mô tả tối đa 20.000 ký tự.';
    if (d.material.length > 500) errs.material = 'Chất liệu tối đa 500 ký tự.';
    if (d.careInstructions.length > 5000)
      errs.careInstructions = 'Hướng dẫn bảo quản tối đa 5.000 ký tự.';
    return errs;
  }

  const mutation = useMutation({
    mutationKey,
    retry: 0,
    mutationFn: async (v: {
      target: ContentTarget;
      draft: ContentDraft;
      epoch: number;
      access: number;
      lock: string;
    }) => {
      if (!current(v)) throw new SessionChangedError();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        PRODUCT_ACTION_TIMEOUT_MS,
      );
      try {
        const body: ChangeProductContentInput = {
          name: v.draft.name.trim(),
          description: v.draft.description.trim() || null,
          material: v.draft.material.trim() || null,
          careInstructions: v.draft.careInstructions.trim() || null,
          expectedVersion: v.draft.expectedVersion,
        };
        return await request<ProductContentResult>(
          `/admin/products/${encodeURIComponent(v.target.id)}/content`,
          {
            method: 'PATCH',
            signal: controller.signal,
            body,
          },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: async (updated, v) => {
      if (!current(v)) return;
      const sawNewer = hasNewerContent(client, actor, updated);
      await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(v)) return;
      client.setQueryData<AdminCatalogDetail>(adminCatalogKeys.detail(actor, updated.id), (old) => {
        if (!old || old.contentVersion > updated.contentVersion) return old;
        return {
          ...old,
          name: updated.name,
          description: updated.description,
          material: updated.material,
          careInstructions: updated.careInstructions,
          contentVersion: updated.contentVersion,
          adminContentFields: updated.adminContentFields,
        };
      });
      await Promise.all([
        refreshLists(),
        client.invalidateQueries({ queryKey: adminCatalogKeys.detail(actor, updated.id) }),
      ]);
      if (!current(v)) return;
      finish({
        text:
          sawNewer || hasNewerContent(client, actor, updated)
            ? 'Yêu cầu đã được xử lý, nhưng sản phẩm có thay đổi mới hơn. Xem nội dung vừa tải lại trước thao tác tiếp theo.'
            : 'Đã lưu thay đổi nội dung sản phẩm. Các trường đã sửa sẽ được giữ khi nguồn cập nhật.',
      });
    },
    onError: async (error, v) => {
      if (!current(v)) return;
      const kind = classifyRequestError(error, 'mutation');
      if (kind === 'forbidden') {
        opened.current = false;
        resetModal();
        markForbidden();
        return;
      }
      if (kind === 'conflict') {
        await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
        if (!current(v)) return;
        if (opened.current) {
          setConflictError(
            'Nội dung đã được thay đổi trên máy chủ. Tải lại dữ liệu mới nhất để xem trước khi lưu lại.',
          );
          return;
        }
        await Promise.all([
          refreshLists(),
          client.resetQueries({ queryKey: adminCatalogKeys.detail(actor, v.target.id) }),
        ]);
        if (!current(v)) return;
        finish({
          error: true,
          text: 'Nội dung đã được thay đổi trên máy chủ. Xem dữ liệu vừa tải lại rồi thử lại.',
        });
        return;
      }
      if (kind === 'unknown') {
        setNeedsCheck(v.target);
        finish({
          error: true,
          recheck: true,
          text: 'Chưa xác định kết quả. Kiểm tra lại nội dung trước thao tác tiếp theo; không tự gửi lại yêu cầu.',
        });
        return;
      }
      if (kind === 'not-found') {
        await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
        if (!current(v)) return;
        await Promise.all([
          refreshLists(),
          client.resetQueries({ queryKey: adminCatalogKeys.detail(actor, v.target.id) }),
        ]);
        if (!current(v)) return;
      }
      const status = error instanceof ApiError ? error.body.statusCode : 0;
      finish({
        error: true,
        text:
          kind === 'not-found' && status !== 400
            ? 'Sản phẩm không còn tồn tại.'
            : status === 400
              ? 'Dữ liệu nội dung không hợp lệ.'
              : kind === 'unauthenticated'
                ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'
                : 'Không thể cập nhật nội dung sản phẩm. Kiểm tra điều kiện rồi thử lại.',
      });
    },
    onSettled: (_data, _error, v) => {
      contentLocks.get(client)?.delete(v.lock);
    },
  });

  const close = () => {
    opened.current = false;
    resetModal();
  };

  const hasUnresolvedConflicts = Boolean(conflictError) || Object.keys(fieldConflicts).length > 0;

  const confirm = () => {
    if (!target || !draft || busy || needsCheck || reloading || hasUnresolvedConflicts) return;
    const validationErrors = validate(draft);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    const lock = `${actor}:${epoch}:${target.id}:content`;
    const pending = contentLocks.get(client) ?? new Set<string>();
    if (pending.has(lock)) return;
    pending.add(lock);
    contentLocks.set(client, pending);
    mutation.mutate({ target, draft, ...stamp(), lock });
  };

  async function reloadLatest() {
    if (!target || !draft || reloading) return;
    const v = stamp();
    const currentReload = ++reloadSeq.current;
    const base = target;
    setReloading(true);
    try {
      await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(v) || !opened.current || reloadSeq.current !== currentReload) return;
      const fresh = await client.fetchQuery({
        queryKey: adminCatalogKeys.detail(actor, base.id),
        queryFn: ({ signal }) =>
          guardQuery(() =>
            request<AdminCatalogDetail>(`/admin/products/${encodeURIComponent(base.id)}`, {
              signal,
            }),
          ),
        staleTime: 0,
        retry: false,
      });
      if (!current(v) || !opened.current || reloadSeq.current !== currentReload) return;
      await refreshLists();
      if (!current(v) || !opened.current || reloadSeq.current !== currentReload) return;

      const currentDraft = draftRef.current ?? draft;
      if (!currentDraft) return;

      const nextDraft: ContentDraft = {
        ...currentDraft,
        expectedVersion: fresh.contentVersion,
      };
      const nextConflicts: FieldConflicts = {};
      for (const field of CONTENT_FIELDS) {
        const baseVal = base[field];
        const draftVal = normalizeDraftField(field, currentDraft[field]);
        const freshVal = fresh[field];
        const userChanged = draftVal !== baseVal;
        const serverChanged = freshVal !== baseVal;
        if (!userChanged) {
          nextDraft[field] = freshVal ?? '';
        } else if (serverChanged && draftVal !== freshVal) {
          nextConflicts[field] = { serverValue: freshVal };
        }
      }
      draftRef.current = nextDraft;
      setTarget(fresh);
      setDraft(nextDraft);
      setFieldConflicts(nextConflicts);
      setConflictError(null);
    } catch (error) {
      if (classifyRequestError(error, 'detail') === 'forbidden') {
        opened.current = false;
        resetModal();
        return;
      }
      if (!current(v) || !opened.current || reloadSeq.current !== currentReload) return;
      const kind = classifyRequestError(error, 'detail');
      if (kind === 'not-found') {
        await refreshLists();
        if (!current(v)) return;
        finish({ error: true, text: 'Sản phẩm không còn tồn tại.' });
        return;
      }
      setConflictError(
        'Chưa tải được dữ liệu mới nhất. Kiểm tra kết nối rồi bấm tải lại trước khi lưu.',
      );
    } finally {
      if (current(v) && reloadSeq.current === currentReload) setReloading(false);
    }
  }

  async function recheck() {
    if (!needsCheck || checking) return;
    const v = stamp();
    setChecking(true);
    try {
      await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(v)) return;
      await client.fetchQuery({
        queryKey: adminCatalogKeys.detail(actor, needsCheck.id),
        queryFn: ({ signal }) =>
          guardQuery(() =>
            request<AdminCatalogDetail>(`/admin/products/${encodeURIComponent(needsCheck.id)}`, {
              signal,
            }),
          ),
        staleTime: 0,
        retry: false,
      });
      if (!current(v)) return;
      await refreshLists();
      if (!current(v)) return;
      setNeedsCheck(null);
      showNotice({ text: 'Đã đối chiếu nội dung sản phẩm mới nhất từ máy chủ.' });
    } catch (error) {
      if (!current(v)) return;
      if (classifyRequestError(error, 'detail') === 'not-found') {
        await refreshLists();
        if (!current(v)) return;
        setNeedsCheck(null);
        showNotice({ error: true, text: 'Sản phẩm không còn tồn tại.' });
      } else
        showNotice({
          error: true,
          recheck: true,
          text: 'Chưa đối chiếu được nội dung. Kiểm tra kết nối rồi thử lại.',
        });
    } finally {
      if (current(v)) setChecking(false);
    }
  }

  const setDraftField = (field: ContentField, value: string) => {
    if (draftRef.current) {
      draftRef.current = { ...draftRef.current, [field]: value };
    }
    setDraft((d) => (d ? { ...d, [field]: value } : null));
    if (errors[field]) {
      setErrors((err) => ({ ...err, [field]: undefined }));
    }
  };

  const resolveFieldConflict = (field: ContentField, mode: 'server' | 'draft') => {
    const conflict = fieldConflicts[field];
    if (!conflict) return;
    if (mode === 'server') {
      const val = conflict.serverValue ?? '';
      if (draftRef.current) draftRef.current = { ...draftRef.current, [field]: val };
      setDraft((d) => (d ? { ...d, [field]: val } : null));
    }
    setFieldConflicts((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const renderFieldConflict = (field: ContentField) => {
    const conflict = fieldConflicts[field];
    if (!conflict) return null;
    return (
      <div role="alert" className={styles.conflictAlert}>
        <p>
          Giá trị mới trên máy chủ: <strong>{conflict.serverValue ?? 'Trống'}</strong>
        </p>
        <div className={styles.actionGroup}>
          <button
            type="button"
            className={styles.statusButton}
            onClick={() => resolveFieldConflict(field, 'server')}
          >
            Dùng bản máy chủ
          </button>
          <button
            type="button"
            className={styles.statusButton}
            onClick={() => resolveFieldConflict(field, 'draft')}
          >
            Giữ bản đang soạn
          </button>
        </div>
      </div>
    );
  };

  const open = (product: AdminCatalogDetail, triggerEl?: HTMLElement) => {
    if (busy || needsCheck) return;
    reloadSeq.current += 1;
    opener.current = triggerEl ?? null;
    opened.current = true;
    setNotice(null);
    setTarget(product);
    const initialDraft: ContentDraft = {
      name: product.name,
      description: product.description ?? '',
      material: product.material ?? '',
      careInstructions: product.careInstructions ?? '',
      expectedVersion: product.contentVersion,
    };
    draftRef.current = initialDraft;
    setDraft(initialDraft);
    setErrors({});
    setConflictError(null);
    setFieldConflicts({});
  };

  const dialogProps: ComponentProps<typeof ConfirmDialog> = {
    open: Boolean(target && draft),
    title: 'Sửa nội dung sản phẩm',
    subject: target ? `Sản phẩm: ${target.name}` : '',
    impacts: [
      'Nội dung được sửa sẽ được bảo vệ khi nhập dữ liệu mới từ nguồn.',
      'Không thay đổi slug, SKU, giá bán, cờ hoạt động hay kho hàng.',
    ],
    confirmLabel: 'Lưu nội dung',
    pendingLabel: 'Đang lưu…',
    tone: 'primary',
    pending: busy,
    returnFocusRef: opener,
    onClose: close,
    onConfirm: confirm,
    children: draft ? (
      <div className={styles.contentForm}>
        {conflictError && (
          <div role="alert" className={styles.conflictAlert}>
            <p>{conflictError}</p>
            <button
              type="button"
              className={styles.statusButton}
              disabled={reloading}
              onClick={() => void reloadLatest()}
            >
              {reloading ? 'Đang tải…' : 'Tải dữ liệu mới nhất'}
            </button>
          </div>
        )}
        {Object.keys(fieldConflicts).length > 0 && (
          <p role="alert" className={styles.fieldError}>
            Một số trường bạn đang sửa cũng vừa thay đổi trên máy chủ. Chọn giá trị cần giữ ở từng
            trường xung đột trước khi lưu.
          </p>
        )}
        <label className={styles.field}>
          <span>Tên sản phẩm *</span>
          <input
            type="text"
            value={draft.name}
            maxLength={200}
            aria-invalid={Boolean(errors.name)}
            onChange={(e) => setDraftField('name', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          />
          <span className={styles.charCount}>{draft.name.length}/200</span>
          {errors.name && (
            <span role="alert" className={styles.fieldError}>
              {errors.name}
            </span>
          )}
          {renderFieldConflict('name')}
        </label>
        <label className={styles.field}>
          <span>Mô tả</span>
          <textarea
            rows={5}
            value={draft.description}
            maxLength={20000}
            onChange={(e) => setDraftField('description', e.target.value)}
          />
          <span className={styles.charCount}>{draft.description.length}/20000</span>
          {errors.description && (
            <span role="alert" className={styles.fieldError}>
              {errors.description}
            </span>
          )}
          {renderFieldConflict('description')}
        </label>
        <label className={styles.field}>
          <span>Chất liệu</span>
          <input
            type="text"
            value={draft.material}
            maxLength={500}
            onChange={(e) => setDraftField('material', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault();
            }}
          />
          <span className={styles.charCount}>{draft.material.length}/500</span>
          {errors.material && (
            <span role="alert" className={styles.fieldError}>
              {errors.material}
            </span>
          )}
          {renderFieldConflict('material')}
        </label>
        <label className={styles.field}>
          <span>Hướng dẫn bảo quản</span>
          <textarea
            rows={3}
            value={draft.careInstructions}
            maxLength={5000}
            onChange={(e) => setDraftField('careInstructions', e.target.value)}
          />
          <span className={styles.charCount}>{draft.careInstructions.length}/5000</span>
          {errors.careInstructions && (
            <span role="alert" className={styles.fieldError}>
              {errors.careInstructions}
            </span>
          )}
          {renderFieldConflict('careInstructions')}
        </label>
      </div>
    ) : null,
  };

  return {
    open,
    close,
    busy: busy || Boolean(needsCheck),
    target,
    draft,
    needsCheck,
    notice:
      needsCheck && !scopedNotice?.recheck
        ? {
            key: `uncertain-${needsCheck.id}`,
            error: true,
            recheck: true,
            text: 'Có yêu cầu chưa xác định kết quả. Kiểm tra lại nội dung trước thao tác tiếp theo.',
          }
        : scopedNotice,
    noticeRef,
    sessionScope,
    clearNotice,
    checking,
    recheck,
    dialogProps,
    pending: mutation.isPending && !target,
  };
}

export type ProductContentAction = ReturnType<typeof useProductContentAction>;

export function ProductContentFeedback({ action }: { action: ProductContentAction }) {
  const { noticeRef, notice, pending, checking, recheck, dialogProps, sessionScope, clearNotice } =
    action;
  const tone = notice?.recheck ? 'warning' : notice?.error ? 'error' : 'success';
  return (
    <>
      <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
        {pending && (
          <p role="status">Đang xử lý yêu cầu. Đóng hộp không hủy thao tác trên máy chủ.</p>
        )}
        {notice && (
          <ActionFeedback
            noticeKey={notice.key}
            sessionScope={sessionScope}
            tone={tone}
            message={notice.text}
            onDismiss={clearNotice}
            action={
              notice.recheck
                ? {
                    label: checking ? 'Đang đối chiếu…' : 'Kiểm tra lại nội dung',
                    onClick: () => void recheck(),
                    disabled: checking,
                  }
                : undefined
            }
          />
        )}
      </div>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export function ProductContentButton({
  product,
  action,
}: {
  product: AdminCatalogDetail;
  action: ProductContentAction;
}) {
  return (
    <button
      type="button"
      className={styles.statusButton}
      disabled={action.busy}
      onClick={(e) => action.open(product, e.currentTarget)}
    >
      Sửa nội dung
    </button>
  );
}
