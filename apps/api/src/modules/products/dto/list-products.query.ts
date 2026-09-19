import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

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
}
