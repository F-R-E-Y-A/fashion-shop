import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  addDaysToDateString,
  AdminReportQueryDto,
  diffCalendarDays,
  getTodayInVietnam,
} from './dto/admin-report-query.dto.js';
import {
  AdminReportSummaryResponse,
  DailyMoneyItemResponse,
  OrderStatusCountItemResponse,
} from './dto/admin-report-summary.response.js';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PAYMENT_REVIEW: 'Chờ đối soát thanh toán',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao hàng',
  DELIVERED: 'Đã giao hàng',
  CANCELLED: 'Đã hủy',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
};

export { addDaysToDateString, diffCalendarDays as diffDays, getTodayInVietnam };

@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Truy van bao cao tong hop cho quan tri vien theo khoang thoi gian.
   * Tat ca so lieu doc tu schema `reporting` duoc snapshot dong bo qua RepeatableRead transaction.
   */
  async getSummaryReport(query: AdminReportQueryDto): Promise<AdminReportSummaryResponse> {
    const to = query.to ?? getTodayInVietnam();
    const from = query.from ?? addDaysToDateString(to, -29);
    const top = query.top ?? 10;
    const days = diffCalendarDays(from, to) + 1;

    const range = {
      from,
      to,
      timezone: 'Asia/Ho_Chi_Minh',
      days,
    };

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);

    return await this.prisma.$transaction(
      async (tx) => {
        // 1. Kiem tra metadata snapshot bang chinh transaction client tx
        const metadataRecord = await tx.reportSnapshotMetadata.findUnique({
          where: { id: 'singleton' },
        });

        if (!metadataRecord || metadataRecord.snapshotVersion === 0n) {
          return {
            status: 'NOT_READY',
            metadata: null,
            range,
            summary: null,
            dailyMoney: [],
            ordersByStatus: [],
            topDeliveredProducts: [],
          };
        }

        const metadata = {
          snapshotVersion: metadataRecord.snapshotVersion.toString(),
          asOf: metadataRecord.asOf.toISOString(),
          lastCompletedAt: metadataRecord.lastCompletedAt.toISOString(),
          metricDefinitionVersion: metadataRecord.metricDefinitionVersion,
          dataQuality: (metadataRecord.dataQualityNotes ? 'DEGRADED' : 'NORMAL') as
            'NORMAL' | 'DEGRADED',
        };

        // 3. Doc DailyRevenue trong ky duoi cung mot repeatable read snapshot cua tx
        const dailyRecords = await tx.dailyRevenue.findMany({
          where: {
            reportDate: {
              gte: fromDate,
              lte: toDate,
            },
          },
          orderBy: { reportDate: 'asc' },
        });

        let totalCollected = new Decimal(0);
        let totalRefunded = new Decimal(0);

        const dailyMoney: DailyMoneyItemResponse[] = dailyRecords.map((r) => {
          const collected = new Decimal(r.revenueAmount);
          const refunded = new Decimal(r.refundedAmount);
          const net = collected.minus(refunded);

          totalCollected = totalCollected.plus(collected);
          totalRefunded = totalRefunded.plus(refunded);

          const dStr = r.reportDate.toISOString().slice(0, 10);
          return {
            date: dStr,
            collectedAmount: collected.toFixed(2),
            refundedAmount: refunded.toFixed(2),
            netAmount: net.toFixed(2),
            orderCount: r.orderCount,
          };
        });

        // 4. Doc OrdersByStatus trong ky
        const statusRecords = await tx.ordersByStatus.findMany({
          where: {
            reportDate: {
              gte: fromDate,
              lte: toDate,
            },
          },
        });

        const statusCountsMap = new Map<string, number>();
        let totalOrdersInCohort = 0;

        for (const record of statusRecords) {
          const prev = statusCountsMap.get(record.orderStatus) ?? 0;
          statusCountsMap.set(record.orderStatus, prev + record.orderCount);
          totalOrdersInCohort += record.orderCount;
        }

        const allKnownStatuses = Object.keys(ORDER_STATUS_LABELS);
        const ordersByStatus: OrderStatusCountItemResponse[] = allKnownStatuses.map((st) => {
          const count = statusCountsMap.get(st) ?? 0;
          const percentage =
            totalOrdersInCohort > 0 ? Number(((count / totalOrdersInCohort) * 100).toFixed(2)) : 0;
          return {
            status: st,
            label: ORDER_STATUS_LABELS[st] ?? st,
            count,
            percentage,
          };
        });

        // 5. Doc TopSellingProduct trong ky
        const topRecords = await tx.topSellingProduct.findMany({
          where: {
            reportDate: {
              gte: fromDate,
              lte: toDate,
            },
          },
        });

        const productMap = new Map<
          string,
          { productName: string; quantity: number; revenue: Decimal }
        >();

        for (const r of topRecords) {
          const existing = productMap.get(r.productId);
          const rev = new Decimal(r.revenueAmount);
          if (existing) {
            existing.quantity += r.quantitySold;
            existing.revenue = existing.revenue.plus(rev);
            if (!existing.productName && r.productName) {
              existing.productName = r.productName;
            }
          } else {
            productMap.set(r.productId, {
              productName: r.productName ?? 'Sản phẩm',
              quantity: r.quantitySold,
              revenue: rev,
            });
          }
        }

        const sortedProducts = Array.from(productMap.entries())
          .map(([productId, info]) => ({
            productId,
            productName: info.productName,
            deliveredQuantity: info.quantity,
            deliveredRevenueAmount: info.revenue.toFixed(2),
          }))
          .sort((a, b) => {
            if (b.deliveredQuantity !== a.deliveredQuantity) {
              return b.deliveredQuantity - a.deliveredQuantity;
            }
            return a.productId.localeCompare(b.productId);
          })
          .slice(0, top);

        const netRevenue = totalCollected.minus(totalRefunded);

        return {
          status: 'READY',
          metadata,
          range,
          summary: {
            totalCollectedAmount: totalCollected.toFixed(2),
            totalRefundedAmount: totalRefunded.toFixed(2),
            netRevenueAmount: netRevenue.toFixed(2),
            totalOrdersInCohort,
          },
          dailyMoney,
          ordersByStatus,
          topDeliveredProducts: sortedProducts,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
