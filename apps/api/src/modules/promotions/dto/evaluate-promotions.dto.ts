import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartItemDto {
  @ApiProperty({
    description: 'ID của biến thể sản phẩm',
    example: 'b0e00000-0000-4000-8000-000000000001',
  })
  @IsUUID('4', { message: 'Mã biến thể sản phẩm phải là định dạng UUID' })
  @IsNotEmpty({ message: 'Mã biến thể không được để trống' })
  variantId!: string;

  @ApiPropertyOptional({
    description: 'Slug danh mục sản phẩm (dùng để áp dụng khuyến mãi theo danh mục)',
    example: 'ao-thun',
  })
  @IsString({ message: 'Slug danh mục phải là chuỗi' })
  @IsOptional()
  categorySlug?: string;

  @ApiProperty({
    description: 'Đơn giá của sản phẩm tại thời điểm mua (VNĐ)',
    example: '250000',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Đơn giá sản phẩm phải là số không âm' })
  @IsNotEmpty({ message: 'Đơn giá không được để trống' })
  price!: string;

  @ApiProperty({
    description: 'Số lượng mua',
    example: 2,
  })
  @IsInt({ message: 'Số lượng phải là số nguyên' })
  @Min(1, { message: 'Số lượng sản phẩm tối thiểu là 1' })
  quantity!: number;
}

export class EvaluatePromotionsDto {
  @ApiProperty({
    description: 'Tạm tính tiền hàng (VNĐ)',
    example: '500000',
  })
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Tạm tính tiền hàng phải là số không âm' })
  @IsNotEmpty({ message: 'Tạm tính tiền hàng không được để trống' })
  subtotal!: string;

  @ApiPropertyOptional({
    description: 'Danh sách sản phẩm trong giỏ hàng',
    type: [CartItemDto],
  })
  @IsArray({ message: 'Danh sách sản phẩm phải là mảng' })
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  @IsOptional()
  items?: CartItemDto[];
}

export class EvaluatedPromotionItem {
  @ApiProperty({ description: 'ID chương trình khuyến mãi' })
  promotionId!: string;

  @ApiProperty({ description: 'Tên chương trình' })
  name!: string;

  @ApiProperty({ description: 'Loại chiến lược giảm giá (PERCENTAGE, FIXED_AMOUNT, TIERED)' })
  discountType!: string;

  @ApiProperty({ description: 'Số tiền được giảm thực tế (VNĐ)' })
  discountAmount!: string;

  @ApiProperty({ description: 'Số tiền sau khi đã trừ giảm giá (VNĐ)' })
  finalAmount!: string;

  @ApiPropertyOptional({ description: 'Chi tiết phân rã tính toán giảm giá' })
  breakdown?: Record<string, unknown>;
}

export class EvaluatePromotionsResponse {
  @ApiProperty({ description: 'Tạm tính gốc của giỏ hàng (VNĐ)' })
  subtotal!: string;

  @ApiProperty({
    description: 'Danh sách tất cả các chương trình khuyến mãi thỏa mãn điều kiện',
    type: [EvaluatedPromotionItem],
  })
  applicablePromotions!: EvaluatedPromotionItem[];

  @ApiPropertyOptional({
    description: 'Chương trình mang lại mức giảm cao nhất cho khách hàng',
    type: EvaluatedPromotionItem,
  })
  bestPromotion!: EvaluatedPromotionItem | null;
}
