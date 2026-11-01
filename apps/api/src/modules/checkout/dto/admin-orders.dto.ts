import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import { OrderResponse } from './checkout.response.js';

/** Khai lai enum OrderStatus: DTO khong doc Prisma (luat ranh gioi); spec doi chieu voi enum. */
export const ADMIN_ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_REVIEW',
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

export class ListAdminOrdersQuery extends PageQuery {
  @ApiPropertyOptional({
    description: 'Mot hoac nhieu trang thai, cach nhau bang dau phay',
    example: 'PROCESSING,SHIPPED',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim()
      ? value.split(',').map((item) => item.trim())
      : undefined,
  )
  @IsIn(ADMIN_ORDER_STATUSES, { each: true, message: 'status khong hop le' })
  @IsOptional()
  status?: AdminOrderStatus[];

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true: don can shop xu ly (doi soat, lenh hoan chua chot, huy da thu tien)',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'attention chi nhan true hoac false' })
  @IsOptional()
  attention?: boolean;

  @ApiPropertyOptional({ description: 'Ma don hoac email khach', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsString()
  @MaxLength(254)
  @IsOptional()
  q?: string;
}

export class DeliveryFailedDto {
  @ApiProperty({ example: 'Khách từ chối nhận, không nghe máy sau 3 lần gọi.' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class CancelRefundDto {
  @ApiProperty({ example: 'Khách gọi báo hủy; hết size.' })
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class AdminOrderSummaryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ enum: ADMIN_ORDER_STATUSES }) status!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() customerEmail!: string;
  @ApiProperty() totalAmount!: string;
  @ApiProperty() itemCount!: number;
  @ApiProperty({ type: String, nullable: true }) gateway!: string | null;
  @ApiProperty({ type: String, nullable: true }) paymentStatus!: string | null;
  @ApiProperty() refundedAmount!: string;
  @ApiProperty() refundPending!: boolean;
}
export class AdminOrderPageResponse {
  @ApiProperty({ type: [AdminOrderSummaryResponse] }) items!: AdminOrderSummaryResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}
export class RefundEntryResponse {
  @ApiProperty() id!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() at!: string;
  @ApiProperty({ type: String, nullable: true }) reason!: string | null;
}
export class PendingRefundResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) amount!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) lastError!: string | null;
  @ApiProperty({ description: 'true: da duoc chot tay (co loi hoac qua 60 giay)' })
  resolvable!: boolean;
}
export class PaymentLedgerResponse {
  @ApiProperty() paymentId!: string;
  @ApiProperty({ type: String, nullable: true }) gateway!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() amount!: string;
  @ApiProperty() refundedAmount!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'null: khong hoan tay duoc luc nay (CONFIRMED dung cancel-refund)',
  })
  refundableAmount!: string | null;
  @ApiProperty({ type: [RefundEntryResponse] }) refunds!: RefundEntryResponse[];
  @ApiProperty({ type: PendingRefundResponse, nullable: true })
  pendingRefund!: PendingRefundResponse | null;
}
export class OrderHistoryResponse {
  @ApiProperty() status!: string;
  @ApiProperty() at!: string;
  @ApiProperty({ type: String, nullable: true }) actorUserId!: string | null;
}
export class AdminOrderActionsResponse {
  @ApiProperty() confirmCod!: boolean;
  @ApiProperty() startProcessing!: boolean;
  @ApiProperty({ description: 'Huy don online da tra chua xu ly: tra kho va hoan toan bo' })
  cancelRefund!: boolean;
  @ApiProperty() markDelivered!: boolean;
  @ApiProperty() deliveryFailed!: boolean;
}
export class AdminOrderResponse extends OrderResponse {
  @ApiProperty({ type: String, nullable: true }) userId!: string | null;
  @ApiProperty() customerEmail!: string;
  @ApiProperty({ type: [OrderHistoryResponse] }) history!: OrderHistoryResponse[];
  @ApiProperty({ type: [PaymentLedgerResponse] }) ledgers!: PaymentLedgerResponse[];
  @ApiProperty({ type: AdminOrderActionsResponse }) actions!: AdminOrderActionsResponse;
}
