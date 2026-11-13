import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportMetadataResponse {
  @ApiProperty({ example: '1' })
  snapshotVersion!: string;

  @ApiProperty({ example: '2026-11-12T15:00:00.000Z' })
  asOf!: string;

  @ApiProperty({ example: '2026-11-12T15:00:00.000Z' })
  lastCompletedAt!: string;

  @ApiProperty({ example: '1.0' })
  metricDefinitionVersion!: string;

  @ApiProperty({ example: 'NORMAL', enum: ['NORMAL', 'DEGRADED'] })
  dataQuality!: 'NORMAL' | 'DEGRADED';
}

export class ReportRangeResponse {
  @ApiProperty({ example: '2026-10-14' })
  from!: string;

  @ApiProperty({ example: '2026-11-12' })
  to!: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  timezone!: string;

  @ApiProperty({ example: 30 })
  days!: number;
}

export class ReportMoneySummaryResponse {
  @ApiProperty({ example: '15000000.00' })
  totalCollectedAmount!: string;

  @ApiProperty({ example: '200000.00' })
  totalRefundedAmount!: string;

  @ApiProperty({ example: '14800000.00' })
  netRevenueAmount!: string;

  @ApiProperty({ example: 50 })
  totalOrdersInCohort!: number;
}

export class DailyMoneyItemResponse {
  @ApiProperty({ example: '2026-11-12' })
  date!: string;

  @ApiProperty({ example: '1000000.00' })
  collectedAmount!: string;

  @ApiProperty({ example: '0.00' })
  refundedAmount!: string;

  @ApiProperty({ example: '1000000.00' })
  netAmount!: string;

  @ApiProperty({ example: 5 })
  orderCount!: number;
}

export class OrderStatusCountItemResponse {
  @ApiProperty({ example: 'DELIVERED' })
  status!: string;

  @ApiProperty({ example: 'Đã giao hàng' })
  label!: string;

  @ApiProperty({ example: 25 })
  count!: number;

  @ApiProperty({ example: 50.0 })
  percentage!: number;
}

export class TopDeliveredProductItemResponse {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Áo thun cổ tròn basic' })
  productName!: string;

  @ApiProperty({ example: 20 })
  deliveredQuantity!: number;

  @ApiProperty({ example: '3800000.00' })
  deliveredRevenueAmount!: string;
}

export class AdminReportSummaryResponse {
  @ApiProperty({ enum: ['READY', 'NOT_READY'], example: 'READY' })
  status!: 'READY' | 'NOT_READY';

  @ApiPropertyOptional({ type: ReportMetadataResponse, nullable: true })
  metadata!: ReportMetadataResponse | null;

  @ApiProperty({ type: ReportRangeResponse })
  range!: ReportRangeResponse;

  @ApiPropertyOptional({ type: ReportMoneySummaryResponse, nullable: true })
  summary!: ReportMoneySummaryResponse | null;

  @ApiProperty({ type: [DailyMoneyItemResponse] })
  dailyMoney!: DailyMoneyItemResponse[];

  @ApiProperty({ type: [OrderStatusCountItemResponse] })
  ordersByStatus!: OrderStatusCountItemResponse[];

  @ApiProperty({ type: [TopDeliveredProductItemResponse] })
  topDeliveredProducts!: TopDeliveredProductItemResponse[];
}
