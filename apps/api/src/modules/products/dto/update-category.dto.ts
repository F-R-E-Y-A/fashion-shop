import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, ValidateIf } from 'class-validator';

import { IsStrictIsoDateString } from './change-category-visibility.dto.js';
import { IsStrictNonNegativeInt32, IsTrimmedCategoryName } from './create-category.dto.js';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Tên danh mục mới (2–120 ký tự)' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString({ message: 'name phải là chuỗi' })
  @IsTrimmedCategoryName(2, 120)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'UUID danh mục cha cấp 1 mới, hoặc null để đưa lên làm danh mục gốc',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID('4', { message: 'parentId phải là UUID v4 hợp lệ' })
  parentId?: string | null;

  @ApiPropertyOptional({ description: 'Thứ tự hiển thị mới (>= 0, số nguyên Int32)' })
  @ValidateIf((_, value) => value !== undefined)
  @IsStrictNonNegativeInt32()
  sortOrder?: number;

  @ApiProperty({
    description:
      'Thời điểm cập nhật dự kiến (ISO 8601 mili-giây UTC kết thúc bằng Z) dùng làm token CAS',
    example: '2026-11-10T08:00:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  @IsStrictIsoDateString()
  expectedUpdatedAt!: string;
}
