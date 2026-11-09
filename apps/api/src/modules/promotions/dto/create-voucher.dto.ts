import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { DiscountType, VoucherStatus } from '../promotions.types.js';

export class CreateVoucherDto {
  @ApiProperty({
    description: 'Mã voucher (tự động chuyển thành chữ hoa)',
    example: 'CHAOMUNG2026',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString({ message: 'Mã voucher phải là chuỗi' })
  @IsNotEmpty({ message: 'Mã voucher không được để trống' })
  @MinLength(3, { message: 'Mã voucher tối thiểu 3 ký tự' })
  @MaxLength(30, { message: 'Mã voucher tối đa 30 ký tự' })
  code!: string;

  @ApiPropertyOptional({
    enum: VoucherStatus,
    description: 'Trạng thái hoạt động',
    default: VoucherStatus.ACTIVE,
  })
  @IsEnum(VoucherStatus, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  status?: VoucherStatus;

  @ApiProperty({
    enum: DiscountType,
    description: 'Loại giảm giá (PERCENTAGE hoặc FIXED_AMOUNT)',
    example: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType, { message: 'Loại giảm giá phải là PERCENTAGE hoặc FIXED_AMOUNT' })
  discountType!: DiscountType;

  @ApiProperty({
    description: 'Giá trị giảm (ví dụ: 10 cho 10%, hoặc 50000 cho 50.000đ)',
    example: '10',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Giá trị giảm phải là số không âm' })
  @IsNotEmpty({ message: 'Giá trị giảm không được để trống' })
  discountValue!: string;

  @ApiPropertyOptional({
    description: 'Số tiền giảm tối đa (VNĐ) khi dùng loại PERCENTAGE',
    example: '100000',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Mức giảm tối đa phải là số không âm' })
  @IsOptional()
  maxDiscountAmount?: string;

  @ApiPropertyOptional({
    description: 'Giá trị đơn hàng tối thiểu (VNĐ) để áp dụng mã',
    example: '200000',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Giá trị đơn tối thiểu phải là số không âm' })
  @IsOptional()
  minOrderAmount?: string;

  @ApiPropertyOptional({
    description: 'Tổng số lượt sử dụng tối đa của mã',
    example: 100,
  })
  @IsInt({ message: 'Giới hạn lượt dùng phải là số nguyên' })
  @Min(1, { message: 'Giới hạn lượt dùng tối thiểu là 1' })
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional({
    description: 'Số lượt sử dụng tối đa cho mỗi tài khoản khách hàng',
    example: 1,
  })
  @IsInt({ message: 'Giới hạn mỗi khách hàng phải là số nguyên' })
  @Min(1, { message: 'Giới hạn mỗi khách hàng tối thiểu là 1' })
  @IsOptional()
  perUserLimit?: number;

  @ApiPropertyOptional({
    description: 'Thời điểm bắt đầu hiệu lực (chuỗi ISO 8601)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsDateString({}, { message: 'Thời điểm bắt đầu phải là chuỗi ISO 8601 hợp lệ' })
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional({
    description: 'Thời điểm kết thúc hiệu lực (chuỗi ISO 8601)',
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsDateString({}, { message: 'Thời điểm kết thúc phải là chuỗi ISO 8601 hợp lệ' })
  @IsOptional()
  endsAt?: string;
}
