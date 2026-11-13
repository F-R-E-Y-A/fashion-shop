import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  REVIEW_CONTENT_MAX,
  REVIEW_HEIGHT_RANGE,
  REVIEW_MEDIA_MAX,
  REVIEW_NOTE_MAX,
  REVIEW_WEIGHT_RANGE,
} from '../review-policy.js';

/** DTO khong doc Prisma (luat ranh gioi) nen khai lai enum; review-policy.spec.ts doi chieu. */
export const FIT_FEEDBACKS = ['TOO_SMALL', 'TRUE_TO_SIZE', 'TOO_LARGE'] as const;
export type FitFeedbackCode = (typeof FIT_FEEDBACKS)[number];
export const REPORT_REASONS = ['SPAM', 'OFFENSIVE', 'IRRELEVANT', 'PRIVACY', 'OTHER'] as const;
export type ReportReasonCode = (typeof REPORT_REASONS)[number];

/**
 * Khoa anh (public_id) tai bang phieu POST /api/uploads/tickets: freya/reviews/<userId>/<ten>. Chi
 * kiem hinh dang o day; dung thu muc cua nguoi gui hay khong do UploadsService kiem.
 */
export const MEDIA_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,250}$/;

/** Gui truong thi moi kiem; `null` van bi kiem (va bi tu choi neu truong khong cho null). */
const whenPresent = ValidateIf((_object: unknown, value: unknown) => value !== undefined);

export class ReviewMediaInput {
  @ApiProperty({
    example: 'freya/reviews/0f6a.../a1b2c3',
    description: 'Khoa anh tu chu ky tai len',
  })
  @IsString({ message: 'media.key phai la chuoi' })
  @Matches(MEDIA_KEY_PATTERN, { message: 'media.key khong hop le' })
  key!: string;
}

/**
 * POST /api/reviews. Khong co userId hay productId: nguoi viet la CurrentUser, san pham suy ra tu
 * dong don. Moi dong don chi mot danh gia (UNIQUE order_item_id).
 */
export class CreateReviewRequest {
  @ApiProperty({ format: 'uuid', description: 'Dong don da giao cua chinh minh' })
  @IsUUID('all', { message: 'orderItemId phai la UUID' })
  orderItemId!: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt({ message: 'rating phai la so nguyen' })
  @Min(1, { message: 'rating nho nhat la 1' })
  @Max(5, { message: 'rating lon nhat la 5' })
  rating!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: REVIEW_CONTENT_MAX })
  @IsOptional()
  @IsString({ message: 'content phai la chuoi' })
  @MaxLength(REVIEW_CONTENT_MAX, { message: `content toi da ${REVIEW_CONTENT_MAX} ky tu` })
  content?: string | null;

  @ApiPropertyOptional({ enum: FIT_FEEDBACKS, nullable: true })
  @IsOptional()
  @IsIn(FIT_FEEDBACKS, { message: 'fitFeedback khong hop le' })
  fitFeedback?: FitFeedbackCode | null;

  @ApiPropertyOptional({ type: Number, nullable: true, ...rangeDoc(REVIEW_HEIGHT_RANGE) })
  @IsOptional()
  @IsInt({ message: 'heightCm phai la so nguyen' })
  @Min(REVIEW_HEIGHT_RANGE.min, { message: `heightCm tu ${REVIEW_HEIGHT_RANGE.min}` })
  @Max(REVIEW_HEIGHT_RANGE.max, { message: `heightCm toi da ${REVIEW_HEIGHT_RANGE.max}` })
  heightCm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, ...rangeDoc(REVIEW_WEIGHT_RANGE) })
  @IsOptional()
  @IsInt({ message: 'weightKg phai la so nguyen' })
  @Min(REVIEW_WEIGHT_RANGE.min, { message: `weightKg tu ${REVIEW_WEIGHT_RANGE.min}` })
  @Max(REVIEW_WEIGHT_RANGE.max, { message: `weightKg toi da ${REVIEW_WEIGHT_RANGE.max}` })
  weightKg?: number | null;

  @ApiPropertyOptional({ default: false, description: 'An ten tren trang cong khai' })
  @IsOptional()
  @IsBoolean({ message: 'isAnonymous phai la true hoac false' })
  isAnonymous?: boolean;

  @ApiPropertyOptional({ type: [ReviewMediaInput], maxItems: REVIEW_MEDIA_MAX })
  @IsOptional()
  @IsArray({ message: 'media phai la mang' })
  @ArrayMaxSize(REVIEW_MEDIA_MAX, { message: `media toi da ${REVIEW_MEDIA_MAX} anh` })
  @ValidateNested({ each: true })
  @Type(() => ReviewMediaInput)
  media?: ReviewMediaInput[];
}

/**
 * PATCH /api/reviews/:id: sua mot lan trong han. Vang mat la giu nguyen; `null` xoa truong tuy
 * chon. `media` gui len thay toan bo bo anh (mang rong = bo het anh).
 */
export class UpdateReviewRequest {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @whenPresent
  @IsInt({ message: 'rating phai la so nguyen' })
  @Min(1, { message: 'rating nho nhat la 1' })
  @Max(5, { message: 'rating lon nhat la 5' })
  rating?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: REVIEW_CONTENT_MAX })
  @IsOptional()
  @IsString({ message: 'content phai la chuoi' })
  @MaxLength(REVIEW_CONTENT_MAX, { message: `content toi da ${REVIEW_CONTENT_MAX} ky tu` })
  content?: string | null;

  @ApiPropertyOptional({ enum: FIT_FEEDBACKS, nullable: true })
  @IsOptional()
  @IsIn(FIT_FEEDBACKS, { message: 'fitFeedback khong hop le' })
  fitFeedback?: FitFeedbackCode | null;

  @ApiPropertyOptional({ type: Number, nullable: true, ...rangeDoc(REVIEW_HEIGHT_RANGE) })
  @IsOptional()
  @IsInt({ message: 'heightCm phai la so nguyen' })
  @Min(REVIEW_HEIGHT_RANGE.min, { message: `heightCm tu ${REVIEW_HEIGHT_RANGE.min}` })
  @Max(REVIEW_HEIGHT_RANGE.max, { message: `heightCm toi da ${REVIEW_HEIGHT_RANGE.max}` })
  heightCm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, ...rangeDoc(REVIEW_WEIGHT_RANGE) })
  @IsOptional()
  @IsInt({ message: 'weightKg phai la so nguyen' })
  @Min(REVIEW_WEIGHT_RANGE.min, { message: `weightKg tu ${REVIEW_WEIGHT_RANGE.min}` })
  @Max(REVIEW_WEIGHT_RANGE.max, { message: `weightKg toi da ${REVIEW_WEIGHT_RANGE.max}` })
  weightKg?: number | null;

  @ApiPropertyOptional()
  @whenPresent
  @IsBoolean({ message: 'isAnonymous phai la true hoac false' })
  isAnonymous?: boolean;

  @ApiPropertyOptional({ type: [ReviewMediaInput], maxItems: REVIEW_MEDIA_MAX })
  @whenPresent
  @IsArray({ message: 'media phai la mang' })
  @ArrayMaxSize(REVIEW_MEDIA_MAX, { message: `media toi da ${REVIEW_MEDIA_MAX} anh` })
  @ValidateNested({ each: true })
  @Type(() => ReviewMediaInput)
  media?: ReviewMediaInput[];
}

export class ReportReviewRequest {
  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS, { message: 'reason khong hop le' })
  reason!: ReportReasonCode;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: REVIEW_NOTE_MAX })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'note phai la chuoi' })
  @MaxLength(REVIEW_NOTE_MAX, { message: `note toi da ${REVIEW_NOTE_MAX} ky tu` })
  note?: string | null;
}

export class ReviewIdParam {
  @IsUUID('all', { message: 'id phai la UUID' })
  id!: string;
}

/** Cung luat voi slug cua products (products/dto/product-slug.param.ts). */
export class ProductSlugParam {
  @IsString({ message: 'slug phai la chuoi' })
  @MaxLength(160, { message: 'slug toi da 160 ky tu' })
  @Matches(/^[a-z0-9-]+$/, { message: 'slug khong hop le' })
  slug!: string;
}

function rangeDoc(range: { min: number; max: number }) {
  return { minimum: range.min, maximum: range.max };
}
