import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Max, MaxLength } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

export const ADMIN_PRODUCT_STATUSES = ['all', 'active', 'inactive'] as const;
export const ADMIN_PRODUCT_SORTS = ['newest', 'name_asc'] as const;

// Doc gia tri goc: @Type Number cua PageQuery khong duoc chap nhan mang/luy thua/chuoi rong.
const strictInteger = ({ obj, key }: { obj: Record<string, unknown>; key: string }): number => {
  const raw = obj[key];
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
};

export class ListAdminProductsQuery extends PageQuery {
  @ApiPropertyOptional({
    maxLength: 120,
    description:
      'Ten hoac SKU bat ky bien the, contains khong phan biet hoa thuong, phan biet dau; %, _ va backslash la literal. Khong ghi log storefront.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    enum: ADMIN_PRODUCT_STATUSES,
    default: 'all',
    description: 'Chi theo Product.isActive; khong dam bao mua duoc hay con hang',
  })
  @IsOptional()
  @IsIn(ADMIN_PRODUCT_STATUSES)
  status: (typeof ADMIN_PRODUCT_STATUSES)[number] = 'all';

  @ApiPropertyOptional({
    enum: ADMIN_PRODUCT_SORTS,
    default: 'newest',
    description: 'createdAt giam hoac name tang theo collation DB, id tang pha hoa',
  })
  @IsOptional()
  @IsIn(ADMIN_PRODUCT_SORTS)
  sort: (typeof ADMIN_PRODUCT_SORTS)[number] = 'newest';

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: 100000,
    description: 'So nguyen thap phan, khong nhan tham so lap',
  })
  @Transform(strictInteger)
  @Max(100000)
  override page = 1;

  @ApiPropertyOptional({ default: 12, minimum: 1, maximum: 60 })
  @Transform(strictInteger)
  override pageSize = 12;
}
