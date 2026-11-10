import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import { isAdminQueryForActor } from '@/core';

import { useAuth } from '../AuthProvider.js';
import { SessionChangedError } from '../session-sync.js';
import { classifyAdminError } from './admin-errors.js';

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
const forbiddenEpochs = new WeakMap<QueryClient, Map<string, number>>();
const listeners = new WeakMap<QueryClient, Set<() => void>>();

export function adminAccessGeneration(queryClient: QueryClient, actorId: string): number {
  return accessGenerations.get(queryClient)?.get(actorId) ?? 0;
}

function revokeAdminAccess(queryClient: QueryClient, actorId: string, epoch: number) {
  const generations = accessGenerations.get(queryClient) ?? new Map<string, number>();
  generations.set(actorId, adminAccessGeneration(queryClient, actorId) + 1);
  accessGenerations.set(queryClient, generations);
  const epochs = forbiddenEpochs.get(queryClient) ?? new Map<string, number>();
  epochs.set(actorId, epoch);
  forbiddenEpochs.set(queryClient, epochs);
  const filters = {
    predicate: (query: Parameters<typeof isAdminQueryForActor>[0]) =>
      isAdminQueryForActor(query, actorId),
  };
  void queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
  for (const notify of listeners.get(queryClient) ?? []) notify();
}

/**
 * May chu tra 403 giua phien (vai ADMIN vua bi go): ghi nho cho actor nay, ngung query va xoa moi
 * du lieu quan tri cua actor. Khong dang xuat tai khoan: chi khu quan tri bi dong.
 */
export function useAdminForbidden(actorId: string, getSessionEpoch: () => number) {
  const queryClient = useQueryClient();
  const epoch = getSessionEpoch();
  const subscribe = useCallback(
    (notify: () => void) => {
      const callbacks = listeners.get(queryClient) ?? new Set<() => void>();
      callbacks.add(notify);
      listeners.set(queryClient, callbacks);
      return () => {
        callbacks.delete(notify);
      };
    },
    [queryClient],
  );
  const snapshot = () => forbiddenEpochs.get(queryClient)?.get(actorId) === epoch;
  const forbidden = useSyncExternalStore(subscribe, snapshot, snapshot);
  const markForbidden = useCallback(() => {
    if (getSessionEpoch() === epoch) revokeAdminAccess(queryClient, actorId, epoch);
  }, [actorId, epoch, getSessionEpoch, queryClient]);
  // Chốt mất quyền ngay trong chuỗi promise, trước khi React kịp render/effect. Nếu chờ
  // effect đọc query.error, POST về sát 403 có thể xóa lỗi đó bằng setQueryData.
  const guardQuery = useCallback(
    async <T>(read: () => Promise<T>): Promise<T> => {
      const access = adminAccessGeneration(queryClient, actorId);
      const current = () =>
        getSessionEpoch() === epoch && adminAccessGeneration(queryClient, actorId) === access;
      if (!current() || forbiddenEpochs.get(queryClient)?.get(actorId) === epoch)
        throw new SessionChangedError();
      try {
        const result = await read();
        if (!current()) throw new SessionChangedError();
        return result;
      } catch (error) {
        if (!current()) throw new SessionChangedError();
        if (classifyAdminError(error, 'detail') === 'forbidden') markForbidden();
        throw error;
      }
    },
    [actorId, epoch, getSessionEpoch, markForbidden, queryClient],
  );
  return {
    forbidden,
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
