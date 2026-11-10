import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ComponentProps, useEffect, useRef, useState } from 'react';

import { ApiError, classifyRequestError } from '@/core';
import {
  adminAccessGeneration,
  SessionChangedError,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { cartKeys } from '@/features/cart';
import { ConfirmDialog } from '@/ui';

import { adminCatalogKeys } from './admin-catalog.api.js';
import {
  adminCategoriesKeys,
  type AdminCategoryNode,
  type CategoryVisibilityResult,
} from './admin-categories.api.js';

export const CATEGORY_ACTION_TIMEOUT_MS = 15_000;

export interface CategoryActionTarget {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
  isParent?: boolean;
  parentHidden?: boolean;
}

export type CategoryActionNotice = { text: string; error?: boolean; recheck?: boolean };

const locks = new WeakMap<object, Set<string>>();

export function useCategoryVisibilityAction() {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const [target, setTarget] = useState<CategoryActionTarget | null>(null);
  const [notice, setNotice] = useState<CategoryActionNotice | null>(null);
  const [checking, setChecking] = useState(false);
  const [focus, setFocus] = useState(0);

  const noticeRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const opened = useRef(false);

  // Lưu marker chưa rõ kết quả theo actor/epoch trong TanStack Query cache để giữ qua điều hướng list/detail
  const checkKey = [...adminCategoriesKeys.all(actor), 'uncertain-status', epoch];
  const check = useQuery<CategoryActionTarget | null>({
    queryKey: checkKey,
    queryFn: () => null,
    enabled: false,
  });
  const needsCheck = check.data ?? null;
  const setNeedsCheck = (value: CategoryActionTarget | null) =>
    client.setQueryData(checkKey, value);

  const mutationKey = [...adminCategoriesKeys.all(actor), 'visibility', epoch];
  const busy = useIsMutating({ mutationKey }) > 0 || Boolean(needsCheck);

  useEffect(() => {
    if (focus) noticeRef.current?.focus();
  }, [focus]);

  const current = (v: { epoch: number; access: number }) =>
    getSessionEpoch() === v.epoch && adminAccessGeneration(client, actor) === v.access;

  const stamp = () => ({
    epoch: getSessionEpoch(),
    access: adminAccessGeneration(client, actor),
  });

  const finish = (next: CategoryActionNotice) => {
    setNotice(next);
    setTarget(null);
    if (opened.current || !opener.current?.isConnected) {
      opened.current = false;
      setFocus((n) => n + 1);
    }
  };

  const mutation = useMutation({
    mutationKey,
    retry: 0,
    mutationFn: async (v: {
      target: CategoryActionTarget;
      epoch: number;
      access: number;
      lock: string;
    }) => {
      if (!current(v)) throw new SessionChangedError();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
        CATEGORY_ACTION_TIMEOUT_MS,
      );
      try {
        return await request<CategoryVisibilityResult>(
          `/admin/categories/${encodeURIComponent(v.target.id)}/visibility`,
          {
            method: 'PATCH',
            signal: controller.signal,
            body: {
              isActive: !v.target.isActive,
              expectedUpdatedAt: v.target.updatedAt,
            },
          },
        );
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: async (data, variables) => {
      if (!current(variables)) return;

      await client.cancelQueries({ queryKey: adminCategoriesKeys.all(actor) });
      if (!current(variables)) return;

      // Invalidate category caches and public caches, kiem tra lai current sau moi await
      await client.invalidateQueries({ queryKey: adminCategoriesKeys.all(actor) });
      if (!current(variables)) return;

      await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(variables)) return;

      await client.invalidateQueries({ queryKey: ['categories'] });
      if (!current(variables)) return;

      await client.invalidateQueries({ queryKey: ['products'] });
      if (!current(variables)) return;

      await client.invalidateQueries({ queryKey: cartKeys.all });
      if (!current(variables)) return;

      const actionText = data.isActive ? 'hiện' : 'ẩn';
      finish({ text: `Đã ${actionText} danh mục "${data.name}" thành công.` });
    },
    onError: async (error, variables) => {
      if (!current(variables)) return;

      const kind = classifyRequestError(error, 'mutation');
      if (kind === 'forbidden') {
        setTarget(null);
        markForbidden();
        finish({ text: 'Tài khoản của bạn không còn quyền quản trị.', error: true });
        return;
      }

      if (kind === 'unknown') {
        setNeedsCheck(variables.target);
        finish({
          error: true,
          recheck: true,
          text: 'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
        });
        return;
      }

      if (kind === 'conflict' || kind === 'not-found') {
        await client.cancelQueries({ queryKey: adminCategoriesKeys.all(actor) });
        if (!current(variables)) return;
        await client.invalidateQueries({ queryKey: adminCategoriesKeys.all(actor) });
        if (!current(variables)) return;
        await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
        if (!current(variables)) return;
        await client.invalidateQueries({ queryKey: ['categories'] });
        if (!current(variables)) return;
        await client.invalidateQueries({ queryKey: ['products'] });
        if (!current(variables)) return;
        await client.invalidateQueries({ queryKey: cartKeys.all });
        if (!current(variables)) return;
      }

      const status = error instanceof ApiError ? error.body.statusCode : 0;
      finish({
        error: true,
        text:
          kind === 'conflict'
            ? 'Danh mục đã được thay đổi trên máy chủ. Đang tải lại dữ liệu mới nhất, vui lòng xác nhận lại.'
            : kind === 'not-found' && status !== 400
              ? 'Danh mục không còn tồn tại.'
              : status === 400
                ? 'Yêu cầu thay đổi trạng thái không hợp lệ.'
                : kind === 'unauthenticated'
                  ? 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.'
                  : 'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
      });
    },
    onSettled: (_data, _error, variables) => {
      if (variables?.lock) {
        locks.get(client)?.delete(variables.lock);
      }
    },
  });

  const requestToggle = (category: CategoryActionTarget, triggerElement?: HTMLElement | null) => {
    if (busy || needsCheck) return;
    if (triggerElement) opener.current = triggerElement;
    opened.current = true;
    setTarget(category);
  };

  const confirmToggle = () => {
    if (!target || busy || needsCheck) return;
    let lockSet = locks.get(client);
    if (!lockSet) {
      lockSet = new Set<string>();
      locks.set(client, lockSet);
    }
    const lockKey = `${actor}:${epoch}:${target.id}`;
    if (lockSet.has(lockKey)) return;
    lockSet.add(lockKey);

    mutation.mutate({
      target,
      ...stamp(),
      lock: lockKey,
    });
  };

  const cancelToggle = () => {
    setTarget(null);
    opened.current = false;
  };

  async function recheck() {
    if (!needsCheck || checking) return;
    const v = stamp();
    setChecking(true);
    try {
      await client.cancelQueries({ queryKey: adminCategoriesKeys.all(actor) });
      if (!current(v)) return;

      await client.fetchQuery({
        queryKey: adminCategoriesKeys.tree(actor),
        queryFn: ({ signal }) =>
          guardQuery(() =>
            request<AdminCategoryNode[]>('/admin/categories', {
              signal,
            }),
          ),
        staleTime: 0,
        retry: false,
      });
      if (!current(v)) return;

      if (needsCheck.id) {
        await client.invalidateQueries({
          queryKey: adminCategoriesKeys.detail(actor, needsCheck.id),
        });
      }
      if (!current(v)) return;

      await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
      if (!current(v)) return;

      await client.invalidateQueries({ queryKey: ['categories'] });
      if (!current(v)) return;

      await client.invalidateQueries({ queryKey: ['products'] });
      if (!current(v)) return;

      await client.invalidateQueries({ queryKey: cartKeys.all });
      if (!current(v)) return;

      setNeedsCheck(null);
      setNotice({
        text: 'Đã đối chiếu trạng thái hiện tại. Bạn có thể xem và xác nhận thao tác mới.',
      });
    } catch (error) {
      if (!current(v)) return;
      if (classifyRequestError(error, 'detail') === 'not-found') {
        await client.invalidateQueries({ queryKey: adminCategoriesKeys.tree(actor) });
        if (!current(v)) return;
        await client.invalidateQueries({ queryKey: adminCatalogKeys.all(actor) });
        if (!current(v)) return;
        await client.invalidateQueries({ queryKey: ['categories'] });
        if (!current(v)) return;
        await client.invalidateQueries({ queryKey: ['products'] });
        if (!current(v)) return;
        await client.invalidateQueries({ queryKey: cartKeys.all });
        if (!current(v)) return;
        setNeedsCheck(null);
        setNotice({ error: true, text: 'Danh mục không còn tồn tại.' });
      } else {
        setNotice({
          error: true,
          recheck: true,
          text: 'Chưa đối chiếu được trạng thái. Kiểm tra kết nối rồi thử lại.',
        });
      }
    } finally {
      if (current(v)) setChecking(false);
    }
  }

  const hiding = target?.isActive ?? false;
  const impacts = hiding
    ? target?.isParent
      ? [
          'Ẩn danh mục cha này sẽ làm toàn bộ các danh mục con trong nhánh không hiển thị trên cửa hàng.',
          'Trạng thái hiển thị riêng của các danh mục con trong cơ sở dữ liệu vẫn được bảo lưu.',
        ]
      : ['Danh mục này sẽ bị ẩn khỏi menu, bộ lọc và các trang khám phá sản phẩm trên cửa hàng.']
    : target?.parentHidden
      ? [
          'Danh mục sẽ được bật trong cơ sở dữ liệu.',
          'Lưu ý: Danh mục cha hiện đang ẩn, nên nhánh con này vẫn sẽ chưa hiển thị hiệu lực trên cửa hàng cho đến khi danh mục cha được bật lại.',
        ]
      : [
          'Danh mục sẽ hiển thị trở lại trên cửa hàng.',
          'Chỉ các danh mục con đang bật mới hiển thị theo; các sản phẩm ngừng bán sẽ không tự động bật.',
        ];

  const dialogProps: ComponentProps<typeof ConfirmDialog> = {
    open: target !== null,
    title: hiding ? 'Ẩn danh mục?' : 'Hiện danh mục?',
    subject: target?.name ?? '',
    impacts,
    confirmLabel: hiding ? 'Ẩn danh mục' : 'Hiện danh mục',
    pendingLabel: 'Đang xử lý…',
    tone: hiding ? 'danger' : 'primary',
    pending: mutation.isPending,
    onConfirm: confirmToggle,
    onClose: cancelToggle,
    returnFocusRef: opener,
  };

  return {
    busy,
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
    clearNotice: () => setNotice(null),
    requestToggle,
    dialogProps,
  };
}
