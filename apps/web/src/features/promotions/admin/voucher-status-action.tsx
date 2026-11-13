import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  type AdminVoucher,
  adminVouchersKeys,
  type UpdateAdminVoucherInput,
} from './admin-vouchers.api.js';

export const VOUCHER_ACTION_TIMEOUT_MS = 15_000;

export interface VoucherActionTarget {
  id: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string;
}

export type VoucherActionNotice = { text: string; error?: boolean; recheck?: boolean };

const locks = new WeakMap<object, Set<string>>();

export function useVoucherStatusAction() {
  const client = useQueryClient();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actor = user?.id ?? '';
  const epoch = getSessionEpoch();
  const { markForbidden, guardQuery } = useAdminForbidden(actor, getSessionEpoch);

  const [target, setTarget] = useState<VoucherActionTarget | null>(null);
  const [notice, setNotice] = useState<VoucherActionNotice | null>(null);
  const [checking, setChecking] = useState(false);
  const [focus, setFocus] = useState(0);

  const noticeRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const opened = useRef(false);

  const checkKey = [...adminVouchersKeys.all(actor), 'uncertain-status', epoch];
  const check = useQuery<VoucherActionTarget | null>({
    queryKey: checkKey,
    queryFn: () => null,
    enabled: false,
  });
  const needsCheck = check.data ?? null;
  const setNeedsCheck = (value: VoucherActionTarget | null) => client.setQueryData(checkKey, value);

  useEffect(() => {
    if (!focus || !notice) return;
    noticeRef.current?.focus();
  }, [focus, notice]);

  const activeLocks = (() => {
    let set = locks.get(client);
    if (!set) {
      set = new Set<string>();
      locks.set(client, set);
    }
    return set;
  })();

  const lockKey = target ? `${actor}:${target.id}` : '';
  const isLocked = Boolean(lockKey && activeLocks.has(lockKey));

  const mutate = useMutation({
    mutationFn: async ({
      id,
      input,
      startEpoch,
      startGeneration,
    }: {
      id: string;
      input: UpdateAdminVoucherInput;
      startEpoch: number;
      startGeneration: number;
    }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VOUCHER_ACTION_TIMEOUT_MS);
      try {
        const res = await request<AdminVoucher>(`/admin/vouchers/${id}`, {
          method: 'PATCH',
          body: input,
          signal: controller.signal,
        });
        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(client, actor) !== startGeneration
        ) {
          throw new SessionChangedError();
        }
        return res;
      } finally {
        clearTimeout(timer);
      }
    },
    onMutate: () => {
      if (lockKey) activeLocks.add(lockKey);
    },
    onSettled: () => {
      if (lockKey) activeLocks.delete(lockKey);
    },
  });

  const mutating = useIsMutating({ mutationKey: adminVouchersKeys.all(actor) });
  const pending = mutate.isPending || isLocked || mutating > 0 || checking || Boolean(needsCheck);

  function open(next: VoucherActionTarget, element?: HTMLElement | null) {
    if (pending || needsCheck) return;
    opener.current = element ?? (document.activeElement as HTMLElement | null);
    opened.current = true;
    setTarget(next);
  }

  function close() {
    setTarget(null);
    if (opened.current && opener.current?.isConnected) {
      opener.current.focus();
    }
    opened.current = false;
  }

  async function recheck(expected: VoucherActionTarget) {
    if (checking) return;
    setChecking(true);
    const startEpoch = getSessionEpoch();
    const startActor = actor;
    const startGeneration = adminAccessGeneration(client, startActor);

    try {
      const fresh = await guardQuery(() => request<AdminVoucher>(`/admin/vouchers/${expected.id}`));
      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(client, startActor) !== startGeneration
      ) {
        return;
      }

      await client.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, fresh.id) });
      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(client, startActor) !== startGeneration
      ) {
        return;
      }

      const targetStatus = expected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      if (fresh.status === targetStatus) {
        setNeedsCheck(null);
        client.setQueryData(adminVouchersKeys.detail(actor, fresh.id), fresh);
        await client.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

        if (
          getSessionEpoch() !== startEpoch ||
          adminAccessGeneration(client, startActor) !== startGeneration
        ) {
          return;
        }

        setNotice({
          text: `Đã xác nhận: mã giảm giá ${fresh.code} hiện ${fresh.status === 'ACTIVE' ? 'đang hoạt động' : 'đã ngừng hoạt động'}.`,
        });
      } else {
        setNotice({
          text: `Mã giảm giá ${fresh.code} vẫn giữ trạng thái cũ trên máy chủ (yêu cầu có thể vẫn đang được xử lý). Vui lòng nhấn kiểm tra lại sau giây lát.`,
          error: true,
        });
      }
      setFocus((f) => f + 1);
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setNeedsCheck(null);
        setNotice({
          text: 'Tài khoản của bạn không còn quyền quản trị.',
          error: true,
        });
        setFocus((f) => f + 1);
        return;
      }

      if (err instanceof ApiError && err.body.statusCode === 404) {
        setNeedsCheck(null);
        await client.invalidateQueries({ queryKey: adminVouchersKeys.all(actor) });
        setNotice({ text: 'Mã giảm giá không còn tồn tại trên hệ thống.', error: true });
        setFocus((f) => f + 1);
        return;
      }
      setNotice({
        text: 'Chưa đối chiếu được trạng thái trên máy chủ. Vui lòng bấm kiểm tra lại.',
        error: true,
        recheck: true,
      });
      setFocus((f) => f + 1);
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (!target || pending) return;
    const current = target;
    const nextStatus: 'ACTIVE' | 'INACTIVE' = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const startEpoch = epoch;
    const startActor = actor;
    const startGeneration = adminAccessGeneration(client, startActor);

    close();

    try {
      const updated = await mutate.mutateAsync({
        id: current.id,
        input: {
          status: nextStatus,
          expectedUpdatedAt: current.updatedAt,
        },
        startEpoch,
        startGeneration,
      });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(client, startActor) !== startGeneration
      ) {
        return;
      }

      await client.cancelQueries({ queryKey: adminVouchersKeys.detail(actor, updated.id) });
      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(client, startActor) !== startGeneration
      ) {
        return;
      }

      client.setQueryData(adminVouchersKeys.detail(actor, updated.id), updated);
      await client.invalidateQueries({ queryKey: adminVouchersKeys.lists(actor) });

      if (
        getSessionEpoch() !== startEpoch ||
        adminAccessGeneration(client, startActor) !== startGeneration
      ) {
        return;
      }

      setNeedsCheck(null);
      setNotice({
        text: `Đã ${nextStatus === 'ACTIVE' ? 'kích hoạt' : 'ngừng hoạt động'} mã giảm giá ${updated.code} thành công.`,
      });
      setFocus((f) => f + 1);
    } catch (err) {
      if (err instanceof SessionChangedError) return;

      if (err instanceof ApiError && err.body.statusCode === 403) {
        markForbidden();
        setNeedsCheck(null);
        setNotice({
          text: 'Tài khoản của bạn không còn quyền quản trị.',
          error: true,
        });
        setFocus((f) => f + 1);
        return;
      }

      if (err instanceof ApiError && err.body.statusCode === 409) {
        await client.invalidateQueries({ queryKey: adminVouchersKeys.all(actor) });
        setNotice({
          text: 'Mã giảm giá đã được thay đổi trên máy chủ bởi người khác. Danh sách đã được làm mới, vui lòng thử lại.',
          error: true,
        });
        setFocus((f) => f + 1);
        return;
      }

      const classification = classifyRequestError(err, 'mutation');
      if (classification === 'invalid') {
        setNotice({ text: 'Dữ liệu không hợp lệ.', error: true });
        setFocus((f) => f + 1);
        return;
      }

      if (classification === 'not-found') {
        await client.invalidateQueries({ queryKey: adminVouchersKeys.all(actor) });
        setNotice({ text: 'Không tìm thấy mã giảm giá trên máy chủ.', error: true });
        setFocus((f) => f + 1);
        return;
      }

      // 5xx / Network / Timeout -> Uncertain status
      setNeedsCheck(current);
      setNotice({
        text: 'Chưa rõ kết quả thao tác do gián đoạn kết nối. Vui lòng đối chiếu trạng thái trước khi thực hiện thao tác mới.',
        error: true,
        recheck: true,
      });
      setFocus((f) => f + 1);
    }
  }

  const dialogProps: ComponentProps<typeof ConfirmDialog> = {
    open: Boolean(target),
    title: target?.status === 'ACTIVE' ? 'Xác nhận ngừng hoạt động mã' : 'Xác nhận kích hoạt mã',
    subject: `Mã giảm giá: ${target?.code ?? ''}`,
    impacts:
      target?.status === 'ACTIVE'
        ? [
            'Mã sẽ không thể áp dụng cho các lượt đặt hàng mới sau thời điểm này.',
            'Không làm thay đổi hoặc hủy bỏ các đơn hàng đã tạo thành công trước đó.',
          ]
        : [
            'Khách hàng sẽ có thể áp dụng mã giảm giá này cho các đơn hàng đủ điều kiện.',
            'Mã vẫn phải thỏa mãn thời gian hiệu lực và các hạn mức đã cấu hình.',
          ],
    confirmLabel: target?.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt',
    pendingLabel: target?.status === 'ACTIVE' ? 'Đang ngừng hoạt động…' : 'Đang kích hoạt…',
    tone: target?.status === 'ACTIVE' ? 'danger' : 'primary',
    pending,
    onConfirm: confirm,
    onClose: close,
    returnFocusRef: opener,
  };

  return {
    open,
    close,
    dialogProps,
    notice,
    noticeRef,
    clearNotice: () => setNotice(null),
    recheckCurrent: needsCheck ? () => recheck(needsCheck) : undefined,
    pending,
    checking,
    target,
  };
}
