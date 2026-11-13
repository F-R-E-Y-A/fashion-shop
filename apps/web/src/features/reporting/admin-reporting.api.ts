import { sessionQueryKeys } from '@/core';

export interface AdminReportRange {
  from: string;
  to: string;
  timezone: string;
  days: number;
}

export interface AdminReportMetadata {
  snapshotVersion: string;
  asOf: string;
  lastCompletedAt: string;
  metricDefinitionVersion: string;
  dataQuality: 'NORMAL' | 'DEGRADED';
}

export interface AdminReportSummaryTotals {
  totalCollectedAmount: string;
  totalRefundedAmount: string;
  netRevenueAmount: string;
  totalOrdersInCohort: number;
}

export interface AdminReportDailyMoney {
  date: string;
  collectedAmount: string;
  refundedAmount: string;
  netAmount: string;
}

export interface AdminReportOrdersByStatus {
  status: string;
  label?: string;
  count: number;
  orderCount?: number;
  percentage: number;
}

export interface AdminReportTopProduct {
  productId: string;
  productName: string;
  deliveredQuantity: number;
  deliveredRevenueAmount: string;
}

export interface AdminReportSummaryResponse {
  status: 'READY' | 'NOT_READY';
  range: AdminReportRange;
  metadata: AdminReportMetadata | null;
  summary: AdminReportSummaryTotals | null;
  dailyMoney: AdminReportDailyMoney[];
  ordersByStatus: AdminReportOrdersByStatus[];
  topDeliveredProducts: AdminReportTopProduct[];
}

export const reportingKeys = {
  all: (actor: string) => [...sessionQueryKeys.adminResource('reports'), actor] as const,
  summary: (actor: string, from?: string, to?: string, top?: number) =>
    [...reportingKeys.all(actor), 'summary', { from, to, top }] as const,
};
