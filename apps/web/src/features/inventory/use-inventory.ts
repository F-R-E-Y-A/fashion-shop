import { useQuery } from '@tanstack/react-query';

import { classifyRequestError } from '@/core';
import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

export function useInventory<T>(key: readonly unknown[], path: string) {
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const { forbidden, guardQuery } = useAdminForbidden(user?.id ?? '', getSessionEpoch);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => guardQuery(() => authenticatedRequest<T>(path, { signal })),
    enabled: Boolean(user) && !forbidden,
    retry: shouldRetryAdminQuery,
    refetchInterval: (state) => (state.state.error ? false : 30000),
  });
  return { query, forbidden, data: query.isError || forbidden ? undefined : query.data };
}
export function inventoryError(error: unknown) {
  const kind = classifyRequestError(error, 'detail');
  if (kind === 'not-found') return 'Không tìm thấy biến thể này.';
  if (kind === 'invalid') return 'Thông tin đường dẫn hoặc phân trang không hợp lệ.';
  if (kind === 'unauthenticated') return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
  return 'Không tải được tồn kho. Kiểm tra kết nối rồi thử lại.';
}
