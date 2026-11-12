import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'ID dòng đơn hàng (order item)', format: 'uuid' })
  @IsUUID('all', { message: 'orderItemId phải là UUID hợp lệ' })
  @IsNotEmpty({ message: 'orderItemId không được để trống' })
  orderItemId!: string;

  @ApiProperty({ description: 'Điểm đánh giá từ 1 đến 5 sao', minimum: 1, maximum: 5 })
  @IsInt({ message: 'rating phải là số nguyên' })
  @Min(1, { message: 'rating nhỏ nhất là 1' })
  @Max(5, { message: 'rating lớn nhất là 5' })
  rating!: number;

  @ApiPropertyOptional({
    description: 'Nội dung đánh giá (tối đa 2000 ký tự)',
    maxLength: 2000,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  @IsOptional()
  @IsString({ message: 'content phải là chuỗi ký tự' })
  @MaxLength(2000, { message: 'content không được vượt quá 2000 ký tự' })
  content?: string | null;
}
