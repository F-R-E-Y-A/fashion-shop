import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

// Đọc giá trị gốc: từ chối mảng, số mũ (1e3), số âm, số thực hoặc chuỗi rỗng.
const strictInteger = ({ obj, key }: { obj: Record<string, unknown>; key: string }): number => {
  const raw = obj[key];
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

export class ListPromotionsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Trang, bắt đầu từ 1', default: 1 })
  @Transform(strictInteger)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page nhỏ nhất là 1' })
  @IsOptional()
  override page: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang, tối đa 60', default: 12 })
  @Transform(strictInteger)
  @IsInt({ message: 'pageSize phải là số nguyên' })
  @Min(1, { message: 'pageSize nhỏ nhất là 1' })
  @Max(60, { message: 'pageSize lớn nhất là 60' })
  @IsOptional()
  override pageSize: number = 12;
}
