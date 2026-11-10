import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';
import { COLOR_FAMILY_KEYS } from '../search/color-family.js';

export const PRODUCT_SORTS = ['newest', 'price_asc', 'price_desc', 'relevance'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_AUDIENCES = ['nam', 'nu'] as const;
export type ProductAudience = (typeof PRODUCT_AUDIENCES)[number];

/** "a,b" hoac lap tham so (a=1&a=2) thanh mang; gia tri khac giu nguyen de IsArray bao 400. */
const csv = (value: unknown): unknown => {
  const split = (s: string): string[] =>
    s
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  if (typeof value === 'string') return split(value);
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => (typeof item === 'string' ? split(item) : [item]));
  }
  return value;
};

const upperAll = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map((v: unknown) => (typeof v === 'string' ? v.toUpperCase() : v))
    : value;

@ValidatorConstraint({ name: 'maxPriceNotBelowMin', async: false })
class MaxPriceNotBelowMin implements ValidatorConstraintInterface {
  validate(maxPrice: unknown, args: ValidationArguments): boolean {
    const min = (args.object as { minPrice?: unknown }).minPrice;
    return typeof min !== 'number' || typeof maxPrice !== 'number' || maxPrice >= min;
  }
  defaultMessage(): string {
    return 'maxPrice phai lon hon hoac bang minPrice';
  }
}

/**
 * Tham so liet ke san pham: phan trang chung (PageQuery) cong cac bo loc rieng.
 * Phan he khac lam DTO liet ke cua minh theo dung mau nay.
 *
 * Co mot trong search, audience, categories, colors, sizes, minPrice, maxPrice, facets hoac
 * sort=relevance thi controller chuyen sang duong tim kiem (search/uses-search-engine.ts);
 * khong co thi giu duong liet ke co ban.
 */
export class ListProductsQuery extends PageQuery {
  @ApiPropertyOptional({
    description:
      'Cau tim kiem tieng Viet, co dau hay khong dau, vd "polo nữ trắng dưới 100k". 2 den 120 ky tu',
  })
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsString()
  @MinLength(2, { message: 'search phai co it nhat 2 ky tu' })
  @MaxLength(120)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Loc theo duong dan rut gon cua danh muc (gom danh muc con)',
  })
  @IsString()
  @MaxLength(140)
  @IsOptional()
  categorySlug?: string;

  @ApiPropertyOptional({
    description: 'Nhieu danh muc, cach nhau bang dau phay; danh muc cha keo theo cac con',
    example: 'ao-so-mi,quan-dai',
  })
  @Transform(({ value }: { value: unknown }) => csv(value))
  @IsArray()
  @ArrayMaxSize(10)
  @Matches(/^[a-z0-9-]{1,140}$/, { each: true, message: 'categories chi gom slug hop le' })
  @IsOptional()
  categories?: string[];

  @ApiPropertyOptional({ enum: PRODUCT_AUDIENCES })
  @IsIn(PRODUCT_AUDIENCES)
  @IsOptional()
  audience?: ProductAudience;

  @ApiPropertyOptional({
    description: 'Ho mau, cach nhau bang dau phay; nhieu mau la HOAC',
    example: 'den,trang',
    enum: COLOR_FAMILY_KEYS,
    isArray: true,
  })
  @Transform(({ value }: { value: unknown }) => csv(value))
  @IsArray()
  @ArrayMaxSize(15)
  @IsIn(COLOR_FAMILY_KEYS, { each: true, message: 'colors phai thuoc cac ho mau da liet ke' })
  @IsOptional()
  colors?: string[];

  @ApiPropertyOptional({
    description: 'Ma co, cach nhau bang dau phay; nhieu co la HOAC. Chua xet ton kho',
    example: 'M,L,32',
  })
  @Transform(({ value }: { value: unknown }) => upperAll(csv(value)))
  @IsArray()
  @ArrayMaxSize(15)
  @Matches(/^[A-Z0-9]{1,6}$/, { each: true, message: 'sizes chi gom ma co hop le' })
  @IsOptional()
  sizes?: string[];

  @ApiPropertyOptional({ description: 'Gia thap nhat (dong), theo price_from', minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'minPrice phai la so nguyen' })
  @Min(0)
  @Max(1_000_000_000)
  @IsOptional()
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Gia cao nhat (dong), theo price_from', minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'maxPrice phai la so nguyen' })
  @Min(0)
  @Max(1_000_000_000)
  @Validate(MaxPriceNotBelowMin)
  @IsOptional()
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: PRODUCT_SORTS,
    description:
      'Mac dinh: moi nhat; khi co search thi theo do lien quan. relevance chi co y nghia khi co search',
  })
  @IsIn(PRODUCT_SORTS)
  @IsOptional()
  sort?: ProductSort;

  @ApiPropertyOptional({ type: Boolean, description: 'Chỉ lọc khi true' })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true thi tra them so dem cho bo loc (facets) tinh tren ket qua hien tai',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  facets?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description:
      'false thi khong ghi cau tim vao nhat ky. Danh cho cac the co dinh tren trang chu, khong phai khach tim',
  })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  @IsOptional()
  log?: boolean;
}
