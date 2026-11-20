import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsNotEmpty, IsOptional, ValidateIf } from 'class-validator';

import { IsValidMoneyString } from './create-product-variant.dto.js';

export class UpdateProductVariantDto {
  @ApiPropertyOptional({ description: 'Giá niêm yết mới (chuỗi Decimal > 0, <= 999.999.999)' })
  @IsOptional()
  @IsValidMoneyString()
  listPrice?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá bán mới / giảm (< listPrice, hoặc null để xóa giá giảm)',
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsValidMoneyString()
  salePrice?: string | null;

  @ApiPropertyOptional({ description: 'Bật hoặc ngừng bán biến thể' })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive?: boolean;

  @ApiProperty({
    description: 'Thời điểm cập nhật mong đợi (ISO 8601) phục vụ CAS optimistic lock',
  })
  @IsNotEmpty({ message: 'expectedUpdatedAt không được để trống' })
  @IsISO8601({}, { message: 'expectedUpdatedAt phải là chuỗi thời gian ISO 8601 hợp lệ' })
  expectedUpdatedAt!: string;
}
