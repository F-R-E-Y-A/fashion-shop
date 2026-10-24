import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

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
