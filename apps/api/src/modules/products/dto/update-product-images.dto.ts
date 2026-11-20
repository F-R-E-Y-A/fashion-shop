import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotContains,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { AdminProductImage } from './admin-product.response.js';

const nullableTrim = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value === undefined ? null : value;
};

export const MAX_PRODUCT_IMAGES = 8;

export class ProductImageItemDto {
  @ApiProperty({
    format: 'uuid',
    description: 'UUID của ảnh hiện hữu hoặc UUID v4 do client tạo cho ảnh mới',
  })
  @IsUUID('all', { message: 'id ảnh phải là UUID hợp lệ' })
  id!: string;

  @ApiPropertyOptional({
    description: 'Khóa ảnh mới từ phiếu tải lên (bỏ trống nếu là ảnh hiện hữu)',
  })
  @IsOptional()
  @IsString({ message: 'key phải là chuỗi' })
  @MinLength(1, { message: 'key không được để trống' })
  @MaxLength(255, { message: 'key tối đa 255 ký tự' })
  @NotContains('\0')
  key?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 200,
    description: 'Mô tả thay thế (alt) của ảnh, tối đa 200 ký tự',
  })
  @Transform(nullableTrim)
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsString({ message: 'alt phải là chuỗi' })
  @MaxLength(200, { message: 'alt tối đa 200 ký tự' })
  @NotContains('\0')
  alt!: string | null;
}

export class UpdateProductImagesDto {
  @ApiProperty({
    type: [ProductImageItemDto],
    description: 'Danh sách bộ ảnh theo thứ tự cuối cùng (vị trí đầu là ảnh đại diện)',
  })
  @IsArray({ message: 'items phải là mảng' })
  @ArrayMaxSize(50, { message: 'Danh sách ảnh quá lớn' })
  @ValidateNested({ each: true })
  @Type(() => ProductImageItemDto)
  items!: ProductImageItemDto[];

  @ApiProperty({ minimum: 0, maximum: 2147483646 })
  @IsInt({ message: 'expectedVersion phải là số nguyên' })
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
}

export class AdminProductImagesResponse {
  @ApiProperty() id!: string;
  @ApiProperty() imagesVersion!: number;
  @ApiProperty() imagesManagedByAdmin!: boolean;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: [AdminProductImage] }) images!: AdminProductImage[];
}
