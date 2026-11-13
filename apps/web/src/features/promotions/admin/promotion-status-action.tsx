import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type RefObject, useRef, useState, useSyncExternalStore } from 'react';

import { ApiError, configureUncertainQueryDefaults } from '@/core';
import { adminAccessGeneration, useAdminForbidden, useAuth } from '@/features/account';
import { ConfirmDialog } from '@/ui';

import {
  type AdminPromotionItem,
  adminPromotionsKeys,
  type PromotionStatus,
} from './admin-promotions.api.js';

interface StatusTarget {
  id: string;
  name: string;
  currentStatus: PromotionStatus;
  updatedAt: string;
}

export interface PromotionStatusActionState {
  target: StatusTarget | null;
  openDialog(promo: AdminPromotionItem, openerElement?: HTMLElement | null): void;
  closeDialog(): void;
  notice: { text: string; error?: boolean } | null;
  clearNotice(): void;
  isPending: boolean;
  isItemLocked(id: string): boolean;
  recheckStatus(id: string): Promise<void>;
  DialogComponent(): React.JSX.Element | null;
}

export function usePromotionStatusAction(onSuccess?: () => void): PromotionStatusActionState {
  const queryClient = useQueryClient();
  configureUncertainQueryDefaults(queryClient);
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const [target, setTarget] = useState<StatusTarget | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const lockedStatusIds = useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => {
      const queries = queryClient.getQueryCache().findAll({
        queryKey: ['uncertain', 'admin', 'promotions', actorId, 'status'],
      });
      const ids: string[] = [];
      for (const q of queries) {
        if (q.state.data) {
          ids.push(q.queryKey[q.queryKey.length - 1] as string);
        }
      }
      return ids.sort().join(',');
    },
    () => '',
  );

  const mutation = useMutation({
    mutationFn: async (variables: {
      target: StatusTarget;
      nextStatus: PromotionStatus;
      epoch: number;
      access: number;
    }) => {
      // Hủy các query đang bay để tránh race condition
      await queryClient.cancelQueries({ queryKey: adminPromotionsKeys.all(actorId) });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const updated = await guardQuery(() =>
          request<AdminPromotionItem>(
            `/admin/promotions/${encodeURIComponent(variables.target.id)}`,
            {
              method: 'PATCH',
              body: {
                status: variables.nextStatus,
                expectedUpdatedAt: variables.target.updatedAt,
              },
              signal: controller.signal,
            },
          ),
        );

        // Hủy các query đang bay trước khi trả về để tránh request cũ đến muộn ghi đè cache
        await queryClient.cancelQueries({
          queryKey: adminPromotionsKeys.detail(actorId, updated.id),
        });
        return updated;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    onSuccess: (data, variables) => {
      // Kiểm tra phiên và quyền sau await
      if (
        getSessionEpoch() !== variables.epoch ||
        adminAccessGeneration(queryClient, actorId) !== variables.access
      ) {
        return;
      }

      // Xóa marker nếu trước đó có
      queryClient.setQueryData(
        adminPromotionsKeys.uncertainMarker(actorId, 'status', data.id),
        null,
      );

      setNotice({
        text: `Đã ${data.status === 'ACTIVE' ? 'kích hoạt' : 'ngưng'} chiến dịch "${data.name}" thành công.`,
        error: false,
      });
      setTarget(null);

      // Cập nhật chi tiết trong cache
      queryClient.setQueryData(adminPromotionsKeys.detail(actorId, data.id), data);
      void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });

      onSuccess?.();
    },
    onError: (err, variables) => {
      if (
        getSessionEpoch() !== variables.epoch ||
        adminAccessGeneration(queryClient, actorId) !== variables.access
      ) {
        return;
      }

      const statusCode = err instanceof ApiError ? err.body.statusCode : 0;
      if (statusCode === 409) {
        setNotice({
          text: 'Dữ liệu chiến dịch đã bị thay đổi bởi người khác. Vui lòng tải lại trước khi đổi trạng thái.',
          error: true,
        });
      } else if (statusCode > 0 && statusCode < 500) {
        setNotice({
          text: err instanceof Error ? err.message : 'Không thể chuyển đổi trạng thái chiến dịch.',
          error: true,
        });
      } else {
        // Lỗi 5xx hoặc timeout/network -> lưu marker uncertain vào cache
        const markerKey = adminPromotionsKeys.uncertainMarker(
          actorId,
          'status',
          variables.target.id,
        );
        queryClient.setQueryData(markerKey, {
          id: variables.target.id,
          target: variables.target,
          nextStatus: variables.nextStatus,
          epoch: variables.epoch,
        });
        setNotice({
          text: err instanceof Error ? err.message : 'Không thể chuyển đổi trạng thái chiến dịch.',
          error: true,
        });
      }
      setTarget(null);
    },
  });

  const isItemLocked = (id: string): boolean => {
    if (mutation.isPending && mutation.variables?.target.id === id) return true;
    return lockedStatusIds.split(',').includes(id);
  };

  const recheckStatus = async (id: string) => {
    const markerKey = adminPromotionsKeys.uncertainMarker(actorId, 'status', id);
    const marker = queryClient.getQueryData<{
      id: string;
      target: StatusTarget;
      nextStatus: PromotionStatus;
      epoch: number;
    }>(markerKey);
    if (!marker) return;

    const checkEpoch = getSessionEpoch();
    const checkAccess = adminAccessGeneration(queryClient, actorId);
    try {
      const fresh = await guardQuery(() =>
        request<AdminPromotionItem>(`/admin/promotions/${encodeURIComponent(id)}`),
      );
      if (
        getSessionEpoch() !== checkEpoch ||
        adminAccessGeneration(queryClient, actorId) !== checkAccess
      ) {
        return;
      }

      if (fresh.status === marker.nextStatus) {
        await queryClient.cancelQueries({ queryKey: adminPromotionsKeys.detail(actorId, id) });
        if (
          getSessionEpoch() !== checkEpoch ||
          adminAccessGeneration(queryClient, actorId) !== checkAccess
        ) {
          return;
        }

        queryClient.setQueryData(markerKey, null);
        queryClient.setQueryData(adminPromotionsKeys.detail(actorId, fresh.id), fresh);
        void queryClient.invalidateQueries({ queryKey: adminPromotionsKeys.lists(actorId) });
        setNotice({
          text: `Đã xác nhận trạng thái chiến dịch "${fresh.name}" thành công.`,
          error: false,
        });
        onSuccess?.();
      } else {
        setNotice({
          text: 'Máy chủ chưa ghi nhận thay đổi trạng thái (vẫn đang xử lý hoặc chưa nhận được). Thao tác tiếp tục bị khóa để bảo vệ tính nhất quán.',
          error: true,
        });
      }
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : 'Không thể kết nối đến máy chủ để kiểm tra trạng thái.',
        error: true,
      });
    }
  };

  const openDialog = (promo: AdminPromotionItem, openerElement?: HTMLElement | null) => {
    if (openerElement) openerRef.current = openerElement;
    setTarget({
      id: promo.id,
      name: promo.name,
      currentStatus: promo.status,
      updatedAt: promo.updatedAt,
    });
  };

  const closeDialog = () => {
    if (mutation.isPending) return;
    setTarget(null);
  };

  const confirmToggle = () => {
    if (!target) return;
    const nextStatus: PromotionStatus = target.currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    mutation.mutate({
      target,
      nextStatus,
      epoch: getSessionEpoch(),
      access: adminAccessGeneration(queryClient, actorId),
    });
  };

  const DialogComponent = () => {
    if (!target) return null;
    const isActivating = target.currentStatus === 'INACTIVE';

    return (
      <ConfirmDialog
        open={Boolean(target)}
        title={isActivating ? 'Kích hoạt chiến dịch khuyến mãi' : 'Ngưng kích hoạt chiến dịch'}
        subject={target.name}
        impacts={
          isActivating
            ? [
                'Chiến dịch sẽ bắt đầu có hiệu lực đối với các đơn hàng mới thỏa mãn điều kiện.',
                'Đảm bảo thời gian bắt đầu và kết thúc phù hợp với kế hoạch bán hàng.',
              ]
            : [
                'Các đơn hàng mới sẽ không còn được áp dụng mức giảm giá từ chiến dịch này.',
                'Các đơn hàng đã hoàn tất hoặc đang xử lý trước đó sẽ không bị ảnh hưởng.',
              ]
        }
        confirmLabel={isActivating ? 'Kích hoạt ngay' : 'Ngưng kích hoạt'}
        pendingLabel="Đang xử lý..."
        tone={isActivating ? 'primary' : 'danger'}
        pending={mutation.isPending}
        onConfirm={confirmToggle}
        onClose={closeDialog}
        returnFocusRef={openerRef as RefObject<HTMLElement | null>}
      />
    );
  };

  return {
    target,
    openDialog,
    closeDialog,
    notice,
    clearNotice: () => setNotice(null),
    isPending: mutation.isPending,
    isItemLocked,
    recheckStatus,
    DialogComponent,
  };
}
