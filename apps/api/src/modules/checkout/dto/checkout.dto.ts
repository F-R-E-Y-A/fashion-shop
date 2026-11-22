import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { type GatewayCode, gatewayCodes } from '../../payments/index.js';

export class PreviewDto {
  @ApiProperty() @IsUUID('4') addressId!: string;
  @ApiProperty({ required: false, description: 'Mã voucher khách nhập (UC-07.2)' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  voucherCode?: string;
  @ApiProperty({ required: false, description: 'Chương trình khuyến mãi tự động khách chọn' })
  @IsOptional()
  @IsUUID('4')
  promotionId?: string;
}
export class ConfirmedLineDto {
  @ApiProperty() @IsUUID('4') variantId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(2_147_483_647) quantity!: number;
}
export class CreateCheckoutDto extends PreviewDto {
  @ApiProperty({ enum: gatewayCodes, default: 'VNPAY', required: false })
  @IsOptional()
  @IsIn(gatewayCodes)
  gateway: GatewayCode = 'VNPAY';
  @ApiProperty() @IsString() @Matches(/^[a-f0-9]{64}$/u) fingerprint!: string;
  @ApiProperty() @IsUUID('4') idempotencyKey!: string;
  @ApiProperty({
    type: [ConfirmedLineDto],
    required: false,
    description:
      'Các dòng khách đã thấy ở bước xác nhận, tối đa 100 (web bỏ trường khi nhiều hơn). Chỉ dùng để nêu tên món vừa hết khi báo giá đổi, không dùng tính giá (ADR-120).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ConfirmedLineDto)
  items?: ConfirmedLineDto[];
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
  @ApiProperty({
    required: false,
    description:
      'Có thì ghi hoàn tay (shop đã chuyển khoản), không gọi cổng (ADR-111). Bắt buộc khi refundMode là MANUAL.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{4,64}$/u, {
    message: 'Mã giao dịch gồm 4-64 ký tự chữ, số, dấu chấm, gạch',
  })
  transferReference?: string;
}
/** Admin chot lenh hoan chua ro ket qua sau khi doi chieu tren cong (merchant portal). */
export class ResolveRefundDto {
  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] })
  @IsIn(['SUCCEEDED', 'FAILED'])
  outcome!: 'SUCCEEDED' | 'FAILED';
  @ApiProperty({ example: 'Đối chiếu merchant portal: chưa có giao dịch hoàn.' })
  @IsString()
  @Length(1, 500)
  note!: string;
}
