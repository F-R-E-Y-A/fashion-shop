import { classifyRequestError, sessionQueryKeys } from '@/core';
import type { AdminOrderSummary } from '@/features/checkout';
import type { AdminLowStockItem } from '@/features/inventory';

export interface OverviewKpi {
  total: number;
}

export interface OverviewAttentionData {
  items: AdminOrderSummary[];
  total: number;
}

export interface OverviewLowStockData {
  items: AdminLowStockItem[];
  total: number;
  threshold: number;
  asOf: string;
}

export const overviewKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('overview'), actorId] as const,
  users: (actorId: string) => [...overviewKeys.all(actorId), 'users'] as const,
  products: (actorId: string) => [...overviewKeys.all(actorId), 'products'] as const,
  orders: (actorId: string) => [...overviewKeys.all(actorId), 'orders'] as const,
  attention: (actorId: string) => [...overviewKeys.all(actorId), 'attention'] as const,
  lowStock: (actorId: string) => [...overviewKeys.all(actorId), 'lowStock'] as const,
};

export const overviewEndpoints = {
  users: '/admin/users?page=1&pageSize=1',
  products: '/admin/products?status=all&page=1&pageSize=1',
  orders: '/admin/orders?page=1&pageSize=1',
  attention: '/admin/orders?attention=true&page=1&pageSize=5',
  lowStock: '/admin/inventory/low-stock?threshold=5&limit=5',
};

export function classifyOverviewError(error: unknown): string {
  const kind = classifyRequestError(error, 'detail');
  if (kind === 'unauthenticated') return 'Phiên đăng nhập đã hết hạn.';
  if (kind === 'forbidden') return 'Không có quyền truy cập.';
  return 'Không tải được dữ liệu.';
}
