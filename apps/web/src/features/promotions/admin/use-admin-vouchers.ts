import { useQuery } from '@tanstack/react-query';

import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

import {
  type AdminVoucher,
  type AdminVoucherListResponse,
  adminVouchersKeys,
  type ListAdminVouchersQuery,
} from './admin-vouchers.api.js';

export function useAdminVouchersList(query: ListAdminVouchersQuery, enabled = true) {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const queryParams = new URLSearchParams();
  if (query.search?.trim()) queryParams.set('search', query.search.trim());
  if (query.status) queryParams.set('status', query.status);
  if (query.page) queryParams.set('page', String(query.page));
  if (query.pageSize) queryParams.set('pageSize', String(query.pageSize));

  const path = `/admin/vouchers${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

  const result = useQuery({
    queryKey: adminVouchersKeys.list(actorId, query),
    queryFn: ({ signal }) => guardQuery(() => request<AdminVoucherListResponse>(path, { signal })),
    enabled: Boolean(actorId) && !forbidden && enabled,
    retry: shouldRetryAdminQuery,
  });

  return {
    result,
    forbidden,
    data: result.isError || forbidden ? undefined : result.data,
  };
}

export function useAdminVoucherDetail(id: string, enabled = true) {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);

  const result = useQuery({
    queryKey: adminVouchersKeys.detail(actorId, id),
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminVoucher>(`/admin/vouchers/${id}`, { signal })),
    enabled: Boolean(actorId) && Boolean(id) && !forbidden && enabled,
    retry: shouldRetryAdminQuery,
  });

  return {
    result,
    forbidden,
    data: result.isError || forbidden ? undefined : result.data,
  };
}
