import { Injectable, Logger } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { OrdersSourceReader } from './source-readers/orders-source.reader.js';
import { PaymentsSourceReader } from './source-readers/payments-source.reader.js';

export const REPORTING_ADVISORY_LOCK_ID = 10896001n;

export interface RefreshResult {
  success: boolean;
  skippedDueToLock?: boolean;
  snapshotVersion?: string;
  asOf?: string;
  dailyRevenueCount?: number;
  ordersByStatusCount?: number;
  topSellingProductCount?: number;
  error?: string;
}

@Injectable()
export class ReportingAggregatorService {
  private readonly logger = new Logger(ReportingAggregatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsReader: PaymentsSourceReader,
    private readonly ordersReader: OrdersSourceReader,
  ) {}

  /**
   * Thuc hien tong hop toan bo so lieu bao cao vao schema `reporting` mot cach nguyen tu.
   * Su dung advisory lock PostgreSQL de ngan chan race conditions khi nhieu tien trinh chay dong thoi.
   * Chay voi isolationLevel RepeatableRead de bao dam ca 3 queries nguon nhin thay cung 1 database snapshot.
   */
  async refreshSnapshot(): Promise<RefreshResult> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // 1. Thu lay advisory lock cap transaction (tu dong giai phong khi commit hoac rollback)
          const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${REPORTING_ADVISORY_LOCK_ID}) AS locked
          `;

          if (!lockRows[0]?.locked) {
            this.logger.warn('Tien trinh tong hop bao cao khac dang chay. Bo qua lan chay nay.');
            return {
              success: false,
              skippedDueToLock: true,
            };
          }

          // Lay timestamp snapshot tu chinh database theo transaction clock
          const timeRows = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
          const asOf = timeRows[0]?.now ?? new Date();

          // 2. Doc so lieu tu cac source readers duoi cung mot transaction snapshot
          const dailyFacts = await this.paymentsReader.getDailyMoneyFacts(tx);
          const statusFacts = await this.ordersReader.getOrdersByStatusFacts(tx);
          const topProductFacts = await this.ordersReader.getTopSellingProductFacts(tx);

          // 3. Xoa sach du lieu cu trong schema reporting
          await tx.$executeRawUnsafe(`DELETE FROM "reporting"."daily_revenue"`);
          await tx.$executeRawUnsafe(`DELETE FROM "reporting"."orders_by_status"`);
          await tx.$executeRawUnsafe(`DELETE FROM "reporting"."top_selling_products"`);

          // 4. Nap du lieu moi vao daily_revenue
          if (dailyFacts.length > 0) {
            await tx.dailyRevenue.createMany({
              data: dailyFacts.map((f) => ({
                reportDate: f.reportDate,
                orderCount: f.orderCount,
                revenueAmount: f.collectedAmount,
                refundedAmount: f.refundedAmount,
                refreshedAt: asOf,
              })),
            });
          }

          // 5. Nap du lieu moi vao orders_by_status
          if (statusFacts.length > 0) {
            await tx.ordersByStatus.createMany({
              data: statusFacts.map((f) => ({
                reportDate: f.reportDate,
                orderStatus: f.orderStatus,
                orderCount: f.orderCount,
                refreshedAt: asOf,
              })),
            });
          }

          // 6. Nap du lieu moi vao top_selling_products
          if (topProductFacts.length > 0) {
            await tx.topSellingProduct.createMany({
              data: topProductFacts.map((f) => ({
                reportDate: f.reportDate,
                productId: f.productId,
                productName: f.productName,
                quantitySold: f.quantitySold,
                revenueAmount: f.revenueAmount,
                refreshedAt: asOf,
              })),
            });
          }

          // 7. Cap nhat metadata snapshotVersion (tang dan)
          const currentMeta = await tx.reportSnapshotMetadata.findUnique({
            where: { id: 'singleton' },
          });

          const nextVersion = currentMeta ? currentMeta.snapshotVersion + 1n : 1n;

          const savedMeta = await tx.reportSnapshotMetadata.upsert({
            where: { id: 'singleton' },
            create: {
              id: 'singleton',
              snapshotVersion: nextVersion,
              asOf,
              lastCompletedAt: asOf,
              metricDefinitionVersion: '1.0',
              dataQualityNotes: null,
            },
            update: {
              snapshotVersion: nextVersion,
              asOf,
              lastCompletedAt: asOf,
              metricDefinitionVersion: '1.0',
              dataQualityNotes: null,
            },
          });

          this.logger.log(
            `Da xuat ban thanh cong bao cao snapshot version ${nextVersion} (asOf: ${asOf.toISOString()})`,
          );

          return {
            success: true,
            snapshotVersion: savedMeta.snapshotVersion.toString(),
            asOf: savedMeta.asOf.toISOString(),
            dailyRevenueCount: dailyFacts.length,
            ordersByStatusCount: statusFacts.length,
            topSellingProductCount: topProductFacts.length,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
    } catch (error) {
      this.logger.error('Tong hop bao cao that bai, da rollback toan bo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
