import { Decimal } from 'decimal.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ReportingService } from './reporting.service.js';

describe('ReportingService (Issue #108)', () => {
  let service: ReportingService;
  let mockPrisma: {
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
    reportSnapshotMetadata: { findUnique: ReturnType<typeof vi.fn> };
    dailyRevenue: { findMany: ReturnType<typeof vi.fn> };
    ordersByStatus: { findMany: ReturnType<typeof vi.fn> };
    topSellingProduct: { findMany: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
      $queryRaw: vi.fn().mockResolvedValue([{}]),
      reportSnapshotMetadata: { findUnique: vi.fn() },
      dailyRevenue: { findMany: vi.fn() },
      ordersByStatus: { findMany: vi.fn() },
      topSellingProduct: { findMany: vi.fn() },
    };
    service = new ReportingService(mockPrisma as unknown as PrismaService);
  });

  it('tra ve NOT_READY khi chua co ban ghi metadata hoac snapshotVersion = 0', async () => {
    mockPrisma.reportSnapshotMetadata.findUnique.mockResolvedValueOnce(null);

    const res = await service.getSummaryReport({});
    expect(res.status).toBe('NOT_READY');
    expect(res.metadata).toBeNull();
    expect(res.summary).toBeNull();
    expect(res.dailyMoney).toHaveLength(0);
    expect(res.range.days).toBe(30);
  });

  it('tinh toan dung tien da thu, tien hoan va thu rong khi co du lieu', async () => {
    const asOf = new Date('2026-11-12T10:00:00Z');
    mockPrisma.reportSnapshotMetadata.findUnique.mockResolvedValueOnce({
      id: 'singleton',
      snapshotVersion: 2n,
      asOf,
      lastCompletedAt: asOf,
      metricDefinitionVersion: '1.0',
      dataQualityNotes: null,
    });

    mockPrisma.dailyRevenue.findMany.mockResolvedValueOnce([
      {
        reportDate: new Date('2026-11-10T00:00:00Z'),
        orderCount: 2,
        revenueAmount: new Decimal('1000000.00'),
        refundedAmount: new Decimal('0.00'),
        refreshedAt: asOf,
      },
      {
        reportDate: new Date('2026-11-11T00:00:00Z'),
        orderCount: 1,
        revenueAmount: new Decimal('500000.00'),
        refundedAmount: new Decimal('200000.00'),
        refreshedAt: asOf,
      },
    ]);

    mockPrisma.ordersByStatus.findMany.mockResolvedValueOnce([
      { reportDate: new Date('2026-11-10T00:00:00Z'), orderStatus: 'DELIVERED', orderCount: 2 },
      { reportDate: new Date('2026-11-11T00:00:00Z'), orderStatus: 'CONFIRMED', orderCount: 1 },
    ]);

    mockPrisma.topSellingProduct.findMany.mockResolvedValueOnce([
      {
        reportDate: new Date('2026-11-10T00:00:00Z'),
        productId: 'prod-1',
        productName: 'Áo thun basic',
        quantitySold: 5,
        revenueAmount: new Decimal('1000000.00'),
      },
    ]);

    const res = await service.getSummaryReport({ from: '2026-11-10', to: '2026-11-11' });

    expect(res.status).toBe('READY');
    expect(res.metadata?.snapshotVersion).toBe('2');
    expect(res.summary?.totalCollectedAmount).toBe('1500000.00');
    expect(res.summary?.totalRefundedAmount).toBe('200000.00');
    expect(res.summary?.netRevenueAmount).toBe('1300000.00');
    expect(res.summary?.totalOrdersInCohort).toBe(3);

    expect(res.dailyMoney).toHaveLength(2);
    expect(res.dailyMoney[0]?.netAmount).toBe('1000000.00');
    expect(res.dailyMoney[1]?.netAmount).toBe('300000.00');

    expect(res.ordersByStatus.find((s) => s.status === 'DELIVERED')?.count).toBe(2);
    expect(res.ordersByStatus.find((s) => s.status === 'CONFIRMED')?.count).toBe(1);
    expect(res.topDeliveredProducts).toHaveLength(1);
    expect(res.topDeliveredProducts[0]?.deliveredQuantity).toBe(5);
  });

  it('ho tro thu rong am ro rang khi chi co hoan tien trong ky', async () => {
    const asOf = new Date('2026-11-12T10:00:00Z');
    mockPrisma.reportSnapshotMetadata.findUnique.mockResolvedValueOnce({
      id: 'singleton',
      snapshotVersion: 3n,
      asOf,
      lastCompletedAt: asOf,
      metricDefinitionVersion: '1.0',
      dataQualityNotes: null,
    });

    mockPrisma.dailyRevenue.findMany.mockResolvedValueOnce([
      {
        reportDate: new Date('2026-11-11T00:00:00Z'),
        orderCount: 0,
        revenueAmount: new Decimal('0.00'),
        refundedAmount: new Decimal('350000.00'),
        refreshedAt: asOf,
      },
    ]);

    mockPrisma.ordersByStatus.findMany.mockResolvedValueOnce([]);
    mockPrisma.topSellingProduct.findMany.mockResolvedValueOnce([]);

    const res = await service.getSummaryReport({ from: '2026-11-11', to: '2026-11-11' });

    expect(res.status).toBe('READY');
    expect(res.summary?.totalCollectedAmount).toBe('0.00');
    expect(res.summary?.totalRefundedAmount).toBe('350000.00');
    expect(res.summary?.netRevenueAmount).toBe('-350000.00');
    expect(res.dailyMoney[0]?.netAmount).toBe('-350000.00');
  });
});
