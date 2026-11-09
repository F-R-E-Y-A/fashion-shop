import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Page } from '../../../common/pagination/page.response.js';
import { DiscountType, VoucherStatus } from '../promotions.types.js';

export class VoucherApplyResult {
  @ApiProperty({ description: 'Trạng thái hợp lệ của mã', example: true })
  valid!: boolean;

  @ApiProperty({ description: 'Mã giảm giá', example: 'FREYA10' })
  code!: string;

  @ApiProperty({
    description: 'ID của mã giảm giá',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  voucherId!: string;

  @ApiProperty({
    description: 'Loại giảm giá',
    enum: DiscountType,
    example: DiscountType.PERCENTAGE,
  })
  discountType!: DiscountType;

  @ApiProperty({ description: 'Giá trị giảm theo cấu hình (ví dụ 10% hoặc 50000)', example: '10' })
  discountValue!: string;

  @ApiProperty({ description: 'Số tiền thực tế được giảm trên đơn này (VNĐ)', example: '50000' })
  discountAmount!: string;

  @ApiProperty({ description: 'Số tiền còn lại sau khi trừ giảm giá (VNĐ)', example: '450000' })
  finalAmount!: string;

  @ApiPropertyOptional({ description: 'Giá trị đơn tối thiểu để áp dụng', example: '200000' })
  minOrderAmount!: string | null;

  @ApiPropertyOptional({ description: 'Mức giảm tối đa áp dụng cho loại %', example: '100000' })
  maxDiscountAmount!: string | null;

  @ApiPropertyOptional({
    description: 'Thông điệp giải thích thêm',
    example: 'Áp dụng mã giảm giá 10% thành công',
  })
  message?: string;
}

export class VoucherResponse {
  @ApiProperty({ description: 'ID mã giảm giá' })
  id!: string;

  @ApiProperty({ description: 'Mã code', example: 'FREYA10' })
  code!: string;

  @ApiProperty({ enum: VoucherStatus, description: 'Trạng thái' })
  status!: VoucherStatus;

  @ApiProperty({ enum: DiscountType, description: 'Hình thức giảm giá' })
  discountType!: DiscountType;

  @ApiProperty({ description: 'Giá trị giảm', example: '10.00' })
  discountValue!: string;

  @ApiPropertyOptional({ description: 'Mức giảm tối đa', example: '100000.00' })
  maxDiscountAmount!: string | null;

  @ApiPropertyOptional({ description: 'Đơn hàng tối thiểu', example: '300000.00' })
  minOrderAmount!: string | null;

  @ApiPropertyOptional({ description: 'Tổng giới hạn lượt dùng', example: 100 })
  usageLimit!: number | null;

  @ApiPropertyOptional({ description: 'Giới hạn lượt dùng mỗi tài khoản', example: 1 })
  perUserLimit!: number | null;

  @ApiProperty({ description: 'Số lượt đã sử dụng', example: 15 })
  usageCount!: number;

  @ApiPropertyOptional({ description: 'Thời điểm bắt đầu hiệu lực' })
  startsAt!: string | null;

  @ApiPropertyOptional({ description: 'Thời điểm kết thúc hiệu lực' })
  endsAt!: string | null;

  @ApiProperty({ description: 'Thời điểm tạo' })
  createdAt!: string;

  @ApiProperty({ description: 'Thời điểm cập nhật' })
  updatedAt!: string;
}

export class VoucherListResponse implements Page<VoucherResponse> {
  @ApiProperty({ type: [VoucherResponse], description: 'Danh sách mã giảm giá' })
  items!: VoucherResponse[];

  @ApiProperty({ description: 'Tổng số bản ghi', example: 25 })
  total!: number;

  @ApiProperty({ description: 'Trang hiện tại', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Kích thước trang', example: 12 })
  pageSize!: number;

  @ApiProperty({ description: 'Tổng số trang', example: 3 })
  totalPages!: number;
}
