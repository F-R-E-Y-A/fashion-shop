import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

import {
  type OverviewAttentionData,
  overviewEndpoints,
  overviewKeys,
  type OverviewKpi,
  type OverviewLowStockData,
} from './admin-overview.api.js';

export function useAdminOverview(actorId: string, getSessionEpoch: () => number) {
  const { authenticatedRequest: request } = useAuth();
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const enabled = Boolean(actorId) && !forbidden;

  const usersQuery = useQuery({
    queryKey: overviewKeys.users(actorId),
    queryFn: ({ signal }) =>
      guardQuery(() => request<OverviewKpi>(overviewEndpoints.users, { signal })),
    enabled,
    retry: shouldRetryAdminQuery,
    staleTime: 0,
    refetchOnMount: true,
  });

  const productsQuery = useQuery({
    queryKey: overviewKeys.products(actorId),
    queryFn: ({ signal }) =>
      guardQuery(() => request<OverviewKpi>(overviewEndpoints.products, { signal })),
    enabled,
    retry: shouldRetryAdminQuery,
    staleTime: 0,
    refetchOnMount: true,
  });

  const ordersQuery = useQuery({
    queryKey: overviewKeys.orders(actorId),
    queryFn: ({ signal }) =>
      guardQuery(() => request<OverviewKpi>(overviewEndpoints.orders, { signal })),
    enabled,
    retry: shouldRetryAdminQuery,
    staleTime: 0,
    refetchOnMount: true,
  });

  const attentionQuery = useQuery({
    queryKey: overviewKeys.attention(actorId),
    queryFn: ({ signal }) =>
      guardQuery(() => request<OverviewAttentionData>(overviewEndpoints.attention, { signal })),
    enabled,
    retry: shouldRetryAdminQuery,
    staleTime: 0,
    refetchOnMount: true,
  });

  const lowStockQuery = useQuery({
    queryKey: overviewKeys.lowStock(actorId),
    queryFn: ({ signal }) =>
      guardQuery(() => request<OverviewLowStockData>(overviewEndpoints.lowStock, { signal })),
    enabled,
    retry: shouldRetryAdminQuery,
    staleTime: 0,
    refetchOnMount: true,
  });

  const refetchAll = useCallback(async () => {
    if (isRefreshing || forbidden) return;
    setIsRefreshing(true);
    try {
      await Promise.allSettled([
        usersQuery.refetch(),
        productsQuery.refetch(),
        ordersQuery.refetch(),
        attentionQuery.refetch(),
        lowStockQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    isRefreshing,
    forbidden,
    usersQuery,
    productsQuery,
    ordersQuery,
    attentionQuery,
    lowStockQuery,
  ]);

  return {
    forbidden,
    isRefreshing,
    refetchAll,
    users: {
      query: usersQuery,
      data: usersQuery.isError || forbidden ? undefined : usersQuery.data,
      isLoading: usersQuery.isLoading,
      isError: usersQuery.isError,
      isRefetching: usersQuery.isRefetching,
      refetch: usersQuery.refetch,
    },
    products: {
      query: productsQuery,
      data: productsQuery.isError || forbidden ? undefined : productsQuery.data,
      isLoading: productsQuery.isLoading,
      isError: productsQuery.isError,
      isRefetching: productsQuery.isRefetching,
      refetch: productsQuery.refetch,
    },
    orders: {
      query: ordersQuery,
      data: ordersQuery.isError || forbidden ? undefined : ordersQuery.data,
      isLoading: ordersQuery.isLoading,
      isError: ordersQuery.isError,
      isRefetching: ordersQuery.isRefetching,
      refetch: ordersQuery.refetch,
    },
    attention: {
      query: attentionQuery,
      data: attentionQuery.isError || forbidden ? undefined : attentionQuery.data,
      isLoading: attentionQuery.isLoading,
      isError: attentionQuery.isError,
      isRefetching: attentionQuery.isRefetching,
      refetch: attentionQuery.refetch,
    },
    lowStock: {
      query: lowStockQuery,
      data: lowStockQuery.isError || forbidden ? undefined : lowStockQuery.data,
      isLoading: lowStockQuery.isLoading,
      isError: lowStockQuery.isError,
      isRefetching: lowStockQuery.isRefetching,
      refetch: lowStockQuery.refetch,
    },
  };
}
