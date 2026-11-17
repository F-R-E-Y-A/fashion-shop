import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RETURN_REASONS, type ReturnReasonCode } from '../return-policy.js';
import { RETURN_STATUSES, type ReturnStatusCode } from './return-input.dto.js';

export const REFUND_METHODS = ['GATEWAY', 'BANK_TRANSFER'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export class ReturnLineResponse {
  @ApiProperty({ format: 'uuid' }) orderItemId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) variantLabel!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ example: '200000.00' }) unitPrice!: string;
  @ApiProperty({ description: 'So luong tra' }) quantity!: number;
  @ApiProperty({ example: '200000.00', description: 'Tien hoan cua dong nay' })
  refundAmount!: string;
}

export class ReturnMediaResponse {
  @ApiProperty() url!: string;
}

/** Khach xem: KHONG co so tai khoan nhan tien (UC-14.1/BR5). */
export class ReturnResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty({ enum: RETURN_STATUSES }) status!: ReturnStatusCode;
  @ApiProperty({ enum: RETURN_REASONS }) reasonCode!: ReturnReasonCode;
  @ApiPropertyOptional({ nullable: true, type: String }) description!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Ly do tu choi/huong dan' })
  decisionNote!: string | null;
  @ApiProperty({ type: [ReturnLineResponse] }) items!: ReturnLineResponse[];
  @ApiProperty({ type: [ReturnMediaResponse] }) media!: ReturnMediaResponse[];
  @ApiProperty({ example: '200000.00', description: 'Tong tien du kien hoan' })
  refundAmount!: string;
  @ApiProperty({ example: '0.00', description: 'Phan phi giao goc duoc hoan' })
  refundShipping!: string;
  @ApiProperty({ enum: REFUND_METHODS }) refundMethod!: RefundMethod;
  @ApiProperty({ description: 'Shop chiu phi gui tra (loi/sai hang)' })
  shopPaysReturnShipping!: boolean;
  @ApiProperty({ description: 'Don COD da luu tai khoan nhan tien (khong tra lai so)' })
  hasRefundAccount!: boolean;
  @ApiProperty() canCancel!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  decidedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  receivedAt!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  completedAt!: string | null;
}

export class ReturnListResponse {
  @ApiProperty({ type: [ReturnResponse] }) items!: ReturnResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}

export class RefundAccountResponse {
  @ApiProperty() bankName!: string;
  @ApiProperty() accountNumber!: string;
  @ApiProperty() accountHolder!: string;
}

export class ReturnRefundResponse {
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] })
  status!: string;
  @ApiProperty({ example: '200000.00' }) amount!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reference!: string | null;
}

/** ADMIN xem: them email khach, tai khoan nhan (don COD, toi khi xong) va lenh hoan. */
export class AdminReturnResponse extends ReturnResponse {
  @ApiProperty() customerEmail!: string;
  @ApiPropertyOptional({ type: RefundAccountResponse, nullable: true })
  refundAccount!: RefundAccountResponse | null;
  @ApiPropertyOptional({ type: ReturnRefundResponse, nullable: true })
  refund!: ReturnRefundResponse | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Cong cua thanh toan da thu' })
  paymentGateway!: string | null;
}

export class AdminReturnListResponse {
  @ApiProperty({ type: [AdminReturnResponse] }) items!: AdminReturnResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}

export class ReturnableLineResponse {
  @ApiProperty({ format: 'uuid' }) orderItemId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) variantLabel!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ example: '200000.00' }) unitPrice!: string;
  @ApiProperty({ description: 'So luong da mua' }) quantity!: number;
}

export const RETURN_BLOCKERS = [
  'NOT_DELIVERED',
  'WINDOW_CLOSED',
  'RETURN_EXISTS',
  'NOT_PAID',
] as const;
export type ReturnBlocker = (typeof RETURN_BLOCKERS)[number];

/** Trang don dung de quyet hien nut va dieu kien truoc khi khach dien (UC-14.1/AC9). */
export class ReturnEligibilityResponse {
  @ApiProperty() eligible!: boolean;
  @ApiPropertyOptional({ enum: RETURN_BLOCKERS, nullable: true })
  blocker!: ReturnBlocker | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  deadline!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'uuid' })
  existingReturnId!: string | null;
  @ApiProperty({ enum: REFUND_METHODS }) refundMethod!: RefundMethod;
  @ApiProperty({ description: 'false: may chu chua bat kho anh, anh khong bat buoc' })
  uploadsEnabled!: boolean;
  @ApiProperty() windowDays!: number;
  @ApiProperty() mediaMax!: number;
  @ApiProperty({ type: [ReturnableLineResponse] }) items!: ReturnableLineResponse[];
}
