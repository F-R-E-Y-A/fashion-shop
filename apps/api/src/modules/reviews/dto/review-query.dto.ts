import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageQuery } from '../../../common/pagination/page.query.js';

/**
 * Chi chuoi 'true' va 'false' moi la boolean. Khong dung @Type(() => Boolean): Boolean('false')
 * la true. Gia tri khac giu nguyen de IsBoolean bao 400.
 */
const explicitBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export const PRODUCT_REVIEW_SORTS = ['helpful', 'newest', 'rating_desc', 'rating_asc'] as const;
export type ProductReviewSort = (typeof PRODUCT_REVIEW_SORTS)[number];

/** GET /api/products/:slug/reviews. Bo loc ket hop bang AND, chi thay danh gia da duyet. */
export class ListProductReviewsQuery extends PageQuery {
  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Chi danh gia dung so sao nay' })
  @Type(() => Number)
  @IsInt({ message: 'rating phai la so nguyen' })
  @Min(1, { message: 'rating nho nhat la 1' })
  @Max(5, { message: 'rating lon nhat la 5' })
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({ type: Boolean, description: 'true: chi danh gia co anh' })
  @Transform(explicitBoolean)
  @IsBoolean({ message: 'withMedia chi nhan true hoac false' })
  @IsOptional()
  withMedia?: boolean;

  @ApiPropertyOptional({ type: Boolean, description: 'true: chi danh gia co viet nhan xet' })
  @Transform(explicitBoolean)
  @IsBoolean({ message: 'withContent chi nhan true hoac false' })
  @IsOptional()
  withContent?: boolean;

  @ApiPropertyOptional({
    enum: PRODUCT_REVIEW_SORTS,
    default: 'helpful',
    description: 'helpful: nhieu luot huu ich truoc; tie-break moi nhat roi id',
  })
  @IsIn(PRODUCT_REVIEW_SORTS, { message: 'sort khong hop le' })
  @IsOptional()
  sort?: ProductReviewSort;
}

export const ADMIN_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AdminReviewStatus = (typeof ADMIN_REVIEW_STATUSES)[number];

/** GET /api/admin/reviews: hang cho duyet mac dinh cu nhat truoc de khong ai bi bo quen. */
export class ListAdminReviewsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ADMIN_REVIEW_STATUSES })
  @IsIn(ADMIN_REVIEW_STATUSES, { message: 'status khong hop le' })
  @IsOptional()
  status?: AdminReviewStatus;

  @ApiPropertyOptional({ type: Boolean, description: 'true: chi danh gia dang bi bao cao' })
  @Transform(explicitBoolean)
  @IsBoolean({ message: 'reported chi nhan true hoac false' })
  @IsOptional()
  reported?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt({ message: 'rating phai la so nguyen' })
  @Min(1, { message: 'rating nho nhat la 1' })
  @Max(5, { message: 'rating lon nhat la 5' })
  @IsOptional()
  rating?: number;

  @ApiPropertyOptional({
    description: 'Tim trong noi dung, email nguoi viet, ten san pham; khong phan biet hoa thuong',
  })
  @Transform(({ value }: { value: unknown }) => {
    const text = typeof value === 'string' ? value.trim() : value;
    return text === '' ? undefined : text;
  })
  @IsString({ message: 'q phai la chuoi' })
  @MaxLength(100, { message: 'q toi da 100 ky tu' })
  @IsOptional()
  q?: string;
}
