import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { configureUncertainQueryDefaults } from '@/core';
import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

import {
  type AdminPromotionDetail,
  type AdminPromotionListResponse,
  adminPromotionsKeys,
} from './admin-promotions.api.js';

export function useAdminPromotions(page = 1, pageSize = 12) {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const key = adminPromotionsKeys.list(actorId, page, pageSize);
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminPromotionListResponse>(
          `/admin/promotions?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
          { signal },
        ),
      ),
    enabled: Boolean(actorId) && !forbidden,
    retry: shouldRetryAdminQuery,
  });

  return {
    result,
    forbidden,
    data: result.isError || forbidden ? undefined : result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useAdminPromotion(id: string | undefined) {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const key = adminPromotionsKeys.detail(actorId, id ?? '');
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      guardQuery(() =>
        request<AdminPromotionDetail>(`/admin/promotions/${encodeURIComponent(id!)}`, { signal }),
      ),
    enabled: Boolean(actorId) && Boolean(id) && !forbidden,
    retry: shouldRetryAdminQuery,
  });

  return {
    result,
    forbidden,
    data: result.isError || forbidden ? undefined : result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error,
    refetch: result.refetch,
  };
}

export function useUncertainMarker<T>(queryKey: readonly unknown[]): T | null {
  const queryClient = useQueryClient();
  configureUncertainQueryDefaults(queryClient);
  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => queryClient.getQueryData<T>(queryKey) ?? null,
    () => null,
  );
}
