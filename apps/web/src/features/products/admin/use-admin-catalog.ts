import { useQuery } from '@tanstack/react-query';

import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

/** Request chung của lát chỉ đọc; 403 được chốt trong promise trước khi cache nhận response. */
export function useAdminCatalog<T>(key: readonly unknown[], path: string, enabled = true) {
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => guardQuery(() => request<T>(path, { signal })),
    enabled: Boolean(actorId) && !forbidden && enabled,
    retry: shouldRetryAdminQuery,
  });
  return { result, forbidden, data: result.isError || forbidden ? undefined : result.data };
}
