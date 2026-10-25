import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

import { type GatewayCode, gatewayCodes } from '../../payments/index.js';

export class PreviewDto {
  @ApiProperty() @IsUUID('4') addressId!: string;
}
export class CreateCheckoutDto extends PreviewDto {
  @ApiProperty({ enum: gatewayCodes, default: 'VNPAY', required: false })
  @IsOptional()
  @IsIn(gatewayCodes)
  gateway: GatewayCode = 'VNPAY';
  @ApiProperty() @IsString() @Matches(/^[a-f0-9]{64}$/u) fingerprint!: string;
  @ApiProperty() @IsUUID('4') idempotencyKey!: string;
}
export class RetryPaymentDto {
  @ApiProperty() @IsUUID('4') idempotencyKey!: string;
}
export class ReconcileDto {
  /** Toan bo tham so return URL cua cong (kem chu ky); server xac thuc chu ky truoc khi tin. */
  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @IsObject()
  params?: Record<string, string>;
}
export class RefundDto {
  @ApiProperty({ required: false, example: '100000.00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/u)
  amount?: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
