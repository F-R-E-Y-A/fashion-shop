import {
  type QueryClient,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { type ComponentProps, useEffect, useRef, useState } from 'react';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ConfirmDialog } from '@/ui';

import {
  type AdminCatalogDetail,
  adminCatalogKeys,
  type AdminCatalogPage,
  type AdminCatalogProduct,
  type ProductStatusResult,
} from './admin-catalog.api.js';
import styles from './AdminCatalog.module.css';

const locks = new WeakMap<object, Set<string>>();
export const PRODUCT_ACTION_TIMEOUT_MS = 15_000;
type Target = Pick<AdminCatalogProduct, 'id' | 'name' | 'adminDisabled' | 'statusVersion'>;
type Notice = { text: string; error?: boolean; recheck?: boolean };

function hasNewerStatus(client: QueryClient, actor: string, updated: ProductStatusResult) {
  return client
    .getQueriesData<AdminCatalogProduct | AdminCatalogPage>({
      queryKey: adminCatalogKeys.all(actor),
    })
    .some(([, data]) =>
      (data ? ('items' in data ? data.items : [data]) : []).some(
        (product) => product.id === updated.id && product.statusVersion > updated.statusVersion,
      ),
    );
}

/** Dung chung list/detail: explicit target, CAS, chan phien/quyen cu va bo tap filter cu. */
export function useProductStatusAction() {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Giữ yêu cầu chưa rõ qua điều hướng list/detail; logout/403 xóa cùng cache phiên.
  const checkKey = [...adminCatalogKeys.all(actor), 'uncertain-status', epoch];
  const check = useQuery<Target | null>({
    queryKey: checkKey,
    queryFn: () => null,
    enabled: false,
  });
  const needsCheck = check.data ?? null;
  const setNeedsCheck = (value: Target | null) => client.setQueryData(checkKey, value);
  const [checking, setChecking] = useState(false);
  const [focus, setFocus] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const opened = useRef(false);
  const mutationKey = [...adminCatalogKeys.all(actor), 'status', epoch];
  const busy = useIsMutating({ mutationKey }) > 0;
  useEffect(() => {
    if (focus) noticeRef.current?.focus();
  }, [focus]);
  const current = (v: { epoch: number; access: number }) =>
    getSessionEpoch() === v.epoch && adminAccessGeneration(client, actor) === v.access;
  const stamp = () => ({ epoch: getSessionEpoch(), access: adminAccessGeneration(client, actor) });
  const finish = (next: Notice) => {
    setNotice(next);
    setTarget(null);
    if (opened.current || !opener.current?.isConnected) {
      opened.current = false;
      setFocus((n) => n + 1);
    }
  };
  const refreshLists = () => client.resetQueries({ queryKey: adminCatalogKeys.lists(actor) });
  const mutation = useMutation({
    mutationKey,
    retry: 0,
    mutationFn: async (v: { target: Target; epoch: number; access: number; lock: string }) => {
      if (!current(v)) throw new SessionChangedError();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        PRODUCT_ACTION_TIMEOUT_MS,
      );
      try {
        return await request<ProductStatusResult>(
          `/admin/products/${encodeURIComponent(v.target.id)}/status`,
          {
            method: 'PATCH',
            signal: controller.signal,
            body: {
              adminDisabled: !v.target.adminDisabled,
              expectedVersion: v.target.statusVersion,
            },
          },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: async (updated, v) => {
      if (!current(v)) return;
      const sawNewer = hasNewerStatus(client, actor, updated);
      await client.cancelQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(v)) return;
      client.setQueryData<AdminCatalogDetail>(adminCatalogKeys.detail(actor, updated.id), (old) =>
        !old || old.statusVersion > updated.statusVersion
          ? old
          : {
              ...old,
              isActive: updated.isActive,
              adminDisabled: updated.adminDisabled,
              statusVersion: updated.statusVersion,
            },
      );
      // Rows co the roi filter/doi trang: bo ca tap cu, khong tu tinh total hay tai tung dong.
      await Promise.all([
        refreshLists(),
        client.invalidateQueries({ queryKey: adminCatalogKeys.detail(actor, updated.id) }),
      ]);
      if (!current(v)) return;
      finish({
        text:
          sawNewer || hasNewerStatus(client, actor, updated)
            ? 'Yêu cầu đã được xử lý, nhưng sản phẩm có thay đổi mới hơn. Xem trạng thái vừa tải lại trước thao tác tiếp theo.'
            : updated.adminDisabled
              ? 'Đã ngừng bán thủ công. Dữ liệu và đơn hiện có được giữ lại.'
              : updated.isActive
                ? 'Đã gỡ ngừng bán thủ công. Trạng thái hiện tại được tải lại từ máy chủ.'
                : 'Đã gỡ ngừng bán thủ công; sản phẩm vẫn chưa bật từ nguồn.',
      });
    },
    onError: async (error, v) => {
      if (!current(v)) return;
      const kind = classifyRequestError(error, 'mutation');
      if (kind === 'forbidden') {
        setTarget(null);
        markForbidden();
        return;
      }
      if (kind === 'unknown') {
        setNeedsCheck(v.target);
        finish({
          error: true,
          recheck: true,
          text: 'Chưa xác định kết quả. Kiểm tra lại trạng thái trước thao tác tiếp theo; không tự gửi lại yêu cầu.',
        });
        return;
      }
      if (kind === 'conflict' || kind === 'not-found') {
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
          kind === 'conflict'
            ? 'Trạng thái đã thay đổi. Xem dữ liệu vừa tải lại rồi xác nhận lại.'
            : kind === 'not-found' && status !== 400
              ? 'Sản phẩm không còn tồn tại.'
              : status === 400
                ? 'Yêu cầu thay đổi trạng thái không hợp lệ.'
                : kind === 'unauthenticated'
                  ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'
                  : 'Không thể thay đổi trạng thái sản phẩm. Kiểm tra điều kiện rồi thử lại.',
      });
    },
    onSettled: (_data, _error, v) => {
      locks.get(client)?.delete(v.lock);
    },
  });
  const close = () => {
    opened.current = false;
    setTarget(null);
  };
  const confirm = () => {
    if (!target || busy || needsCheck) return;
    const lock = `${actor}:${epoch}:${target.id}`;
    const pending = locks.get(client) ?? new Set<string>();
    if (pending.has(lock)) return;
    pending.add(lock);
    locks.set(client, pending);
    mutation.mutate({ target, ...stamp(), lock });
  };
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
      setNotice({
        text: 'Đã đối chiếu trạng thái hiện tại. Bạn có thể xem và xác nhận thao tác mới.',
      });
    } catch (error) {
      if (!current(v)) return;
      if (classifyRequestError(error, 'detail') === 'not-found') {
        await refreshLists();
        if (!current(v)) return;
        setNeedsCheck(null);
        setNotice({ error: true, text: 'Sản phẩm không còn tồn tại.' });
      } else
        setNotice({
          error: true,
          recheck: true,
          text: 'Chưa đối chiếu được trạng thái. Kiểm tra kết nối rồi thử lại.',
        });
    } finally {
      if (current(v)) setChecking(false);
    }
  }
  const disabling = target ? !target.adminDisabled : false;
  const dialogProps: ComponentProps<typeof ConfirmDialog> = {
    open: target !== null,
    title: disabling ? 'Ngừng bán sản phẩm này?' : 'Gỡ ngừng bán thủ công?',
    subject: target?.name ?? '',
    impacts: disabling
      ? [
          'Ẩn sản phẩm khỏi cửa hàng; lần đọc giỏ tiếp theo sẽ bỏ chọn sản phẩm ngừng bán.',
          'Giữ dữ liệu, đơn hàng và tồn kho hiện có. Không hủy đơn hoặc checkout đã đọc dữ liệu trước đó.',
          'Các lần import sau không tự gỡ ngừng bán thủ công.',
        ]
      : [
          'Gỡ ngừng bán thủ công và tính lại cờ sản phẩm theo ảnh nguồn hiện có.',
          'Không tự bật danh mục, biến thể hoặc chọn lại giỏ; không đảm bảo còn hàng hay mua được.',
        ],
    confirmLabel: disabling ? 'Ngừng bán' : 'Gỡ ngừng bán',
    pendingLabel: 'Đang xử lý…',
    tone: disabling ? 'danger' : 'primary',
    pending: busy,
    onConfirm: confirm,
    onClose: close,
    returnFocusRef: opener,
  };
  return {
    busy: busy || Boolean(needsCheck),
    open: (product: Target, button: HTMLElement) => {
      if (busy || needsCheck) return;
      opener.current = button;
      opened.current = true;
      setNotice(null);
      setTarget(product);
    },
    notice:
      needsCheck && !notice?.recheck
        ? {
            error: true,
            recheck: true,
            text: 'Có yêu cầu chưa xác định kết quả. Kiểm tra lại trạng thái trước thao tác tiếp theo.',
          }
        : notice,
    noticeRef,
    checking,
    recheck,
    dialogProps,
    pending: mutation.isPending && !target,
  };
}

export type ProductStatusAction = ReturnType<typeof useProductStatusAction>;
export function ProductStatusFeedback({ action }: { action: ProductStatusAction }) {
  const { noticeRef, notice, pending, checking, recheck, dialogProps } = action;
  return (
    <>
      <div ref={noticeRef} tabIndex={-1} className={styles.noticeSlot}>
        <div role="status">{notice && !notice.error && <p>{notice.text}</p>}</div>
        {pending && (
          <p role="status">Đang xử lý yêu cầu. Đóng hộp không hủy thao tác trên máy chủ.</p>
        )}
        {notice?.error && (
          <div role="alert">
            <p>{notice.text}</p>
            {notice.recheck && (
              <button
                className={styles.statusButton}
                type="button"
                disabled={checking}
                onClick={() => void recheck()}
              >
                {checking ? 'Đang đối chiếu…' : 'Kiểm tra lại trạng thái'}
              </button>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export function ProductStatusButton({
  product,
  action,
}: {
  product: AdminCatalogProduct;
  action: ProductStatusAction;
}) {
  return (
    <button
      type="button"
      className={styles.statusButton}
      data-tone={product.adminDisabled ? 'primary' : 'danger'}
      disabled={action.busy}
      onClick={(event) => action.open(product, event.currentTarget)}
    >
      {product.adminDisabled ? 'Gỡ ngừng bán' : 'Ngừng bán'}
    </button>
  );
}
