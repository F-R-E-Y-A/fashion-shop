import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/**
 * Tham so liet ke san pham: phan trang chung (PageQuery) cong hai bo loc rieng.
 * Phan he khac lam DTO liet ke cua minh theo dung mau nay.
 */
export class ListProductsQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Tim theo ten san pham, khong phan biet hoa thuong' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Loc theo duong dan rut gon cua danh muc' })
  @IsString()
  @MaxLength(140)
  @IsOptional()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'newest' })
  @IsIn(PRODUCT_SORTS)
  @IsOptional()
  sort: ProductSort = 'newest';

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ lọc khi true' })
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  @IsOptional()
  featured?: boolean;
}
