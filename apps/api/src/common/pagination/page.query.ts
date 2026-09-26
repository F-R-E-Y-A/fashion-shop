import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Tham so phan trang chung cua moi duong dan liet ke.
 * DTO liet ke cua tung phan he `extends PageQuery` roi them bo loc rieng (xem products/dto).
 * ValidationPipe o app.setup.ts loai bo moi tham so khong khai bao, nen khong ai gui them truong la vao duoc.
 */
export class PageQuery {
  @ApiPropertyOptional({ description: 'Trang, bat dau tu 1', default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page phai la so nguyen' })
  @Min(1, { message: 'page nho nhat la 1' })
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ description: 'So ban ghi moi trang, toi da 60', default: 12 })
  @Type(() => Number)
  @IsInt({ message: 'pageSize phai la so nguyen' })
  @Min(1, { message: 'pageSize nho nhat la 1' })
  @Max(60, { message: 'pageSize lon nhat la 60' })
  @IsOptional()
  pageSize: number = 12;
}
