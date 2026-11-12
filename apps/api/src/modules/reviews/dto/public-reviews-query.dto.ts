import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PublicReviewsQueryDto {
  @ApiPropertyOptional({ description: 'Trang, bắt đầu từ 1, tối đa 100000', default: 1 })
  @Type(() => Number)
  @IsInt({ message: 'page phải là số nguyên' })
  @Min(1, { message: 'page nhỏ nhất là 1' })
  @Max(100000, { message: 'page lớn nhất là 100000' })
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ description: 'Số bản ghi mỗi trang, tối đa 60', default: 12 })
  @Type(() => Number)
  @IsInt({ message: 'pageSize phải là số nguyên' })
  @Min(1, { message: 'pageSize nhỏ nhất là 1' })
  @Max(60, { message: 'pageSize lớn nhất là 60' })
  @IsOptional()
  pageSize: number = 12;
}
