import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Tham so cho phep o duong dan liet ke san pham.
 * ValidationPipe o main.ts se loai bo moi tham so khong khai bao o day,
 * nen khong ai gui them truong la vao duoc.
 */
export class ListProductsQuery {
  @ApiPropertyOptional({ description: 'Trang, bat dau tu 1', default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page phai la so nguyen' })
  @Min(1, { message: 'page nho nhat la 1' })
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ description: 'So ban ghi moi trang', default: 12 })
  @Type(() => Number)
  @IsInt({ message: 'pageSize phai la so nguyen' })
  @Min(1, { message: 'pageSize nho nhat la 1' })
  @Max(60, { message: 'pageSize lon nhat la 60' })
  @IsOptional()
  pageSize: number = 12;

  @ApiPropertyOptional({ description: 'Tim theo ten san pham' })
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
