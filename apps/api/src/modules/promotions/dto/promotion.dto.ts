import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { Page } from '../../../common/pagination/page.response.js';
import { DiscountType, PromotionStatus } from '../promotions.types.js';

export class CreatePromotionDto {
  @ApiProperty({
    description: 'Tên chương trình khuyến mãi',
    example: 'Khuyến mãi Khai trương mùa thu',
  })
  @IsString({ message: 'Tên chương trình phải là chuỗi' })
  @IsNotEmpty({ message: 'Tên chương trình không được để trống' })
  @MinLength(3, { message: 'Tên chương trình tối thiểu 3 ký tự' })
  @MaxLength(100, { message: 'Tên chương trình tối đa 100 ký tự' })
  name!: string;

  @ApiProperty({
    enum: DiscountType,
    description: 'Loại giảm giá (PERCENTAGE hoặc FIXED_AMOUNT)',
    example: DiscountType.PERCENTAGE,
  })
  @IsEnum(DiscountType, { message: 'Loại giảm giá phải là PERCENTAGE hoặc FIXED_AMOUNT' })
  discountType!: DiscountType;

  @ApiProperty({
    description: 'Giá trị giảm (ví dụ: 15 cho 15%, hoặc 30000 cho 30.000đ)',
    example: '15',
  })
  @IsNumberString({}, { message: 'Giá trị giảm phải là chuỗi số hợp lệ' })
  @IsNotEmpty({ message: 'Giá trị giảm không được để trống' })
  discountValue!: string;

  @ApiPropertyOptional({
    description: 'Số tiền giảm tối đa (VNĐ) khi dùng loại %',
    example: '150000',
  })
  @IsNumberString({}, { message: 'Mức giảm tối đa phải là chuỗi số hợp lệ' })
  @IsOptional()
  maxDiscountAmount?: string;

  @ApiPropertyOptional({ description: 'Đơn hàng tối thiểu (VNĐ) để áp dụng', example: '400000' })
  @IsNumberString({}, { message: 'Giá trị đơn tối thiểu phải là chuỗi số hợp lệ' })
  @IsOptional()
  minOrderAmount?: string;

  @ApiPropertyOptional({
    description: 'Điều kiện JsonB (danh mục áp dụng, sản phẩm, combo...)',
    example: {},
  })
  @IsOptional()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({
    enum: PromotionStatus,
    description: 'Trạng thái hoạt động',
    default: PromotionStatus.ACTIVE,
  })
  @IsEnum(PromotionStatus, { message: 'Trạng thái không hợp lệ' })
  @IsOptional()
  status?: PromotionStatus;

  @ApiPropertyOptional({ description: 'Thời điểm bắt đầu hiệu lực (chuỗi ISO 8601)' })
  @IsDateString({}, { message: 'Thời điểm bắt đầu phải là chuỗi ISO 8601 hợp lệ' })
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Thời điểm kết thúc hiệu lực (chuỗi ISO 8601)' })
  @IsDateString({}, { message: 'Thời điểm kết thúc phải là chuỗi ISO 8601 hợp lệ' })
  @IsOptional()
  endsAt?: string;
}

export class PromotionResponse {
  @ApiProperty({ description: 'ID khuyến mãi' })
  id!: string;

  @ApiProperty({ description: 'Tên chương trình' })
  name!: string;

  @ApiProperty({ enum: DiscountType, description: 'Loại giảm giá' })
  discountType!: DiscountType;

  @ApiProperty({ description: 'Giá trị giảm' })
  discountValue!: string;

  @ApiPropertyOptional({ description: 'Mức giảm tối đa' })
  maxDiscountAmount!: string | null;

  @ApiPropertyOptional({ description: 'Đơn hàng tối thiểu' })
  minOrderAmount!: string | null;

  @ApiPropertyOptional({ description: 'Cấu hình điều kiện JsonB' })
  conditions!: Record<string, unknown> | null;

  @ApiProperty({ enum: PromotionStatus, description: 'Trạng thái' })
  status!: PromotionStatus;

  @ApiPropertyOptional({ description: 'Bắt đầu' })
  startsAt!: string | null;

  @ApiPropertyOptional({ description: 'Kết thúc' })
  endsAt!: string | null;

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt!: string;

  @ApiProperty({ description: 'Thời điểm cập nhật' })
  updatedAt!: string;
}

export class PromotionListResponse implements Page<PromotionResponse> {
  @ApiProperty({ type: [PromotionResponse], description: 'Danh sách chương trình khuyến mãi' })
  items!: PromotionResponse[];

  @ApiProperty({ description: 'Tổng số bản ghi', example: 10 })
  total!: number;

  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Kích thước trang', example: 12 })
  pageSize!: number;

  @ApiProperty({ description: 'Tổng số trang', example: 1 })
  totalPages!: number;
}
