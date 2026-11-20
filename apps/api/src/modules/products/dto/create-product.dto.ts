import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
  NotContains,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { CATEGORY_SLUG_REGEX } from './create-category.dto.js';
import { IsValidMoneyString, SKU_REGEX } from './create-product-variant.dto.js';
import { MAX_PRODUCT_IMAGES } from './update-product-images.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const nullableTrim = ({ value }: { value: unknown }) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value === undefined ? null : value;
};
const notNull = (_o: unknown, value: unknown) => value !== null && value !== undefined;

export const PRODUCT_AUDIENCES = ['nam', 'nu', 'unisex'] as const;
export type ProductAudience = (typeof PRODUCT_AUDIENCES)[number];

export class CreateInitialVariantDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 do client sinh cho biến thể ban đầu' })
  @IsUUID('4', { message: 'variants[].id phải là UUID v4 hợp lệ' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'UUID của màu sắc' })
  @IsUUID('all', { message: 'variants[].colorId phải là UUID hợp lệ' })
  colorId!: string;

  @ApiProperty({ format: 'uuid', description: 'UUID của kích cỡ' })
  @IsUUID('all', { message: 'variants[].sizeId phải là UUID hợp lệ' })
  sizeId!: string;

  @ApiProperty({ description: 'Mã SKU duy nhất toàn cục' })
  @IsString({ message: 'variants[].sku phải là chuỗi' })
  @MinLength(1, { message: 'variants[].sku không được để trống' })
  @MaxLength(60, { message: 'variants[].sku tối đa 60 ký tự' })
  @Matches(SKU_REGEX, {
    message: 'variants[].sku chỉ gồm ký tự chữ, số, dấu gạch ngang (-) hoặc gạch dưới (_)',
  })
  sku!: string;

  @ApiProperty({ description: 'Giá niêm yết (> 0, <= 999.999.999)' })
  @IsNotEmpty({ message: 'variants[].listPrice không được để trống' })
  @IsValidMoneyString()
  listPrice!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá bán / giảm (< listPrice, hoặc null nếu không giảm)',
  })
  @ValidateIf(notNull)
  @IsValidMoneyString()
  salePrice?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Trạng thái kinh doanh của biến thể' })
  @IsOptional()
  @IsBoolean({ message: 'variants[].isActive phải là boolean' })
  isActive?: boolean;
}

export class CreateInitialImageDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 do client sinh cho ảnh ban đầu' })
  @IsUUID('4', { message: 'images[].id phải là UUID v4 hợp lệ' })
  id!: string;

  @ApiProperty({ description: 'Khóa ảnh đã tải lên qua phiếu product' })
  @IsString({ message: 'images[].key phải là chuỗi' })
  @MinLength(1, { message: 'images[].key không được để trống' })
  @MaxLength(255, { message: 'images[].key tối đa 255 ký tự' })
  @NotContains('\0')
  key!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString({ message: 'images[].alt phải là chuỗi' })
  @MaxLength(200, { message: 'images[].alt tối đa 200 ký tự' })
  @NotContains('\0')
  alt?: string | null;
}

export class CreateProductDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 do client sinh để bảo đảm idempotency' })
  @IsUUID('4', { message: 'id phải là UUID v4 hợp lệ' })
  id!: string;

  @ApiProperty({ minLength: 1, maxLength: 200 })
  @Transform(trim)
  @IsString({ message: 'name phải là chuỗi' })
  @Length(1, 200, { message: 'name phải dài từ 1 đến 200 ký tự' })
  @NotContains('\0')
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, minLength: 2, maxLength: 120 })
  @IsOptional()
  @ValidateIf(notNull)
  @IsString({ message: 'slug phải là chuỗi' })
  @Length(2, 120, { message: 'slug phải dài từ 2 đến 120 ký tự' })
  @Matches(CATEGORY_SLUG_REGEX, {
    message: 'slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang (-)',
  })
  slug?: string | null;

  @ApiProperty({ format: 'uuid', description: 'UUID danh mục lá' })
  @IsUUID('all', { message: 'categoryId phải là UUID hợp lệ' })
  categoryId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @ValidateIf(notNull)
  @IsUUID('all', { message: 'brandId phải là UUID hợp lệ' })
  brandId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 20000 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString({ message: 'description phải là chuỗi' })
  @MaxLength(20000, { message: 'description tối đa 20.000 ký tự' })
  @NotContains('\0')
  description?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString({ message: 'material phải là chuỗi' })
  @MaxLength(500, { message: 'material tối đa 500 ký tự' })
  @NotContains('\0')
  material?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @Transform(nullableTrim)
  @ValidateIf(notNull)
  @IsString({ message: 'careInstructions phải là chuỗi' })
  @MaxLength(5000, { message: 'careInstructions tối đa 5.000 ký tự' })
  @NotContains('\0')
  careInstructions?: string | null;

  @ApiPropertyOptional({ enum: PRODUCT_AUDIENCES, nullable: true })
  @IsOptional()
  @ValidateIf(notNull)
  @IsIn(PRODUCT_AUDIENCES, { message: 'audience phải là nam, nu hoặc unisex' })
  audience?: ProductAudience | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean({ message: 'isFeatured phải là boolean' })
  isFeatured?: boolean;

  @ApiProperty({ type: [CreateInitialVariantDto], minItems: 1, maxItems: 50 })
  @IsArray({ message: 'variants phải là mảng' })
  @ArrayMinSize(1, { message: 'Sản phẩm phải có ít nhất một biến thể' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 biến thể khi tạo mới' })
  @ValidateNested({ each: true })
  @Type(() => CreateInitialVariantDto)
  variants!: CreateInitialVariantDto[];

  @ApiPropertyOptional({ type: [CreateInitialImageDto], maxItems: MAX_PRODUCT_IMAGES })
  @IsOptional()
  @IsArray({ message: 'images phải là mảng' })
  @ArrayMaxSize(MAX_PRODUCT_IMAGES, {
    message: `Chỉ được đính kèm tối đa ${MAX_PRODUCT_IMAGES} ảnh khi tạo mới`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateInitialImageDto)
  images?: CreateInitialImageDto[];
}
