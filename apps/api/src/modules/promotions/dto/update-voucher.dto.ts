import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { IsStrictIsoDateString } from '../voucher-concurrency.js';
import { CreateVoucherDto } from './create-voucher.dto.js';

export class UpdateVoucherDto extends PartialType(CreateVoucherDto) {
  @ApiPropertyOptional({
    description:
      'Thời điểm cập nhật dự kiến (ISO 8601 mili-giây UTC kết thúc bằng Z) dùng làm token CAS',
    example: '2026-11-10T08:00:00.000Z',
  })
  @IsString({ message: 'expectedUpdatedAt phải là chuỗi' })
  @IsOptional()
  @IsStrictIsoDateString()
  expectedUpdatedAt?: string;
}
