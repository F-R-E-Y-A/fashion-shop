import { useQuery } from '@tanstack/react-query';

import { classifyRequestError } from '@/core';
import { shouldRetryAdminQuery, useAdminForbidden, useAuth } from '@/features/account';

import { type AdminReportSummaryResponse, reportingKeys } from './admin-reporting.api';
import { type ReportQueryParams } from './admin-reporting-query';

export function useAdminReports(params: ReportQueryParams) {
  const { user, authenticatedRequest, getSessionEpoch } = useAuth();
  const { forbidden, guardQuery } = useAdminForbidden(user?.id ?? '', getSessionEpoch);

  const queryParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    top: String(params.top),
  });
  const path = `/admin/reports/summary?${queryParams.toString()}`;

  const query = useQuery({
    queryKey: reportingKeys.summary(user?.id ?? '', params.from, params.to, params.top),
    queryFn: ({ signal }) =>
      guardQuery(() => authenticatedRequest<AdminReportSummaryResponse>(path, { signal })),
    enabled: Boolean(user) && !forbidden,
    retry: shouldRetryAdminQuery,
    refetchInterval: (state) => (state.state.error ? false : 60000),
  });

  return {
    query,
    forbidden,
    data: query.isError || forbidden ? undefined : query.data,
  };
}

export function reportError(error: unknown): string {
  const kind = classifyRequestError(error, 'detail');
  if (kind === 'unauthenticated') return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
  if (kind === 'invalid') return 'Khoảng ngày hoặc tham số báo cáo không hợp lệ.';
  return 'Không tải được báo cáo. Kiểm tra kết nối rồi thử lại.';
}
