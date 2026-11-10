import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import { VoucherStatus } from '../promotions.types.js';

export class ListVouchersQuery extends PageQuery {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo mã voucher',
    example: 'CHAOBAN',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    enum: VoucherStatus,
    description: 'Lọc theo trạng thái',
  })
  @IsEnum(VoucherStatus)
  @IsOptional()
  status?: VoucherStatus;
}
