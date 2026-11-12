import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import { VoucherStatus } from '../promotions.types.js';

const strictInteger = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (raw === undefined) {
    return undefined;
  }
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

const strictSingleString = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  if (raw === undefined) {
    return undefined;
  }
  return typeof raw === 'string' ? raw : false;
};

export class ListVouchersQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Trang, bat dau tu 1', default: 1 })
  @Transform(strictInteger)
  @IsInt({ message: 'page phai la so nguyen' })
  @Min(1, { message: 'page nho nhat la 1' })
  @IsOptional()
  override page: number = 1;

  @ApiPropertyOptional({ description: 'So ban ghi moi trang, toi da 60', default: 12 })
  @Transform(strictInteger)
  @IsInt({ message: 'pageSize phai la so nguyen' })
  @Min(1, { message: 'pageSize nho nhat la 1' })
  @Max(60, { message: 'pageSize lon nhat la 60' })
  @IsOptional()
  override pageSize: number = 12;

  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo mã voucher',
    example: 'CHAOBAN',
  })
  @Transform(strictSingleString)
  @IsString({ message: 'Từ khóa tìm kiếm phải là chuỗi' })
  @MaxLength(50, { message: 'Từ khóa tìm kiếm tối đa 50 ký tự' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: VoucherStatus,
    description: 'Lọc theo trạng thái',
  })
  @Transform(strictSingleString)
  @IsEnum(VoucherStatus, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  status?: VoucherStatus;
}
