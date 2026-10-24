import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useAuth } from '../AuthProvider.js';
import { classifyAdminError } from './admin-errors.js';
import { adminUserKeys } from './admin-users.api.js';

/** Quan tri vien dang thao tac: id la phan cua moi query key, request di qua authenticatedRequest. */
export function useAdminActor() {
  const { authenticatedRequest, getSessionEpoch, user } = useAuth();
  return { actorId: user?.id ?? '', request: authenticatedRequest, getSessionEpoch };
}

/**
 * The he quyen quan tri cua tung actor tren mot QueryClient. Tang moi khi may chu tra 403: ket qua
 * cua thao tac bat dau truoc do (POST da duoc may chu xu ly, ve muon) khong duoc ghi lai vao cache
 * vua bi xoa. Nam ngoai React vi mutation giu closure luc bam va trang co the da unmount.
 */
const accessGenerations = new WeakMap<QueryClient, Map<string, number>>();

export function adminAccessGeneration(queryClient: QueryClient, actorId: string): number {
  return accessGenerations.get(queryClient)?.get(actorId) ?? 0;
}

function revokeAdminAccess(queryClient: QueryClient, actorId: string) {
  const generations = accessGenerations.get(queryClient) ?? new Map<string, number>();
  generations.set(actorId, adminAccessGeneration(queryClient, actorId) + 1);
  accessGenerations.set(queryClient, generations);
}

/**
 * May chu tra 403 giua phien (vai ADMIN vua bi go): ghi nho cho actor nay, ngung query va xoa moi
 * du lieu quan tri cua actor. Khong dang xuat tai khoan: chi khu quan tri bi dong.
 */
export function useAdminForbidden(actorId: string) {
  const queryClient = useQueryClient();
  const [forbiddenFor, setForbiddenFor] = useState<string | null>(null);
  const markForbidden = useCallback(() => {
    revokeAdminAccess(queryClient, actorId);
    setForbiddenFor(actorId);
    void queryClient.cancelQueries({ queryKey: adminUserKeys.actor(actorId) });
    queryClient.removeQueries({ queryKey: adminUserKeys.actor(actorId) });
  }, [actorId, queryClient]);
  // Chốt mất quyền ngay trong chuỗi promise, trước khi React kịp render/effect. Nếu chờ
  // effect đọc query.error, POST về sát 403 có thể xóa lỗi đó bằng setQueryData.
  const guardQuery = useCallback(
    async <T>(read: () => Promise<T>): Promise<T> => {
      try {
        return await read();
      } catch (error) {
        if (classifyAdminError(error, 'detail') === 'forbidden') markForbidden();
        throw error;
      }
    },
    [markForbidden],
  );
  return {
    forbidden: forbiddenFor !== null && forbiddenFor === actorId,
    markForbidden,
    guardQuery,
  };
}

const dateFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatAdminDate = (iso: string): string => dateFormat.format(new Date(iso));
export const formatAdminDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));
export const formatCount = (value: number): string => new Intl.NumberFormat('vi-VN').format(value);
