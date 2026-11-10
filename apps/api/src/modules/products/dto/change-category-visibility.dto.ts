import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export class AdminCategoryIdParam {
  @ApiProperty({ format: 'uuid', description: 'Mã UUID của danh mục' })
  @IsUUID('all', { message: 'id phải là UUID hợp lệ' })
  id!: string;
}

export function IsStrictIsoDateString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrictIsoDateString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          // Bắt buộc ISO 8601 có mili-giây và kết thúc bằng Z (UTC)
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
          const timestamp = Date.parse(value);
          if (Number.isNaN(timestamp)) return false;
          // Đối chiếu round-trip để loại bỏ ngày không hợp lệ (ví dụ ngày 31/02)
          return new Date(timestamp).toISOString() === value;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'expectedUpdatedAt phải đúng chuẩn ISO 8601 mili-giây (YYYY-MM-DDTHH:mm:ss.sssZ) và là ngày hợp lệ';
        },
      },
    });
  };
}

export class ChangeCategoryVisibilityDto {
  @ApiProperty({
    description: 'Trạng thái hiển thị mục tiêu: true (hiện), false (ẩn)',
  })
  @IsBoolean()
  isActive!: boolean;

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

export class AdminCategoryVisibilityResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description:
      'Trạng thái hiển thị hiệu lực trên Storefront: true khi bản thân isActive và danh mục cha (nếu có) cũng isActive',
  })
  effectiveActive!: boolean;

  @ApiProperty({
    description: 'true nếu danh mục cha đang bị ẩn làm nhánh con này không hiển thị hiệu lực',
  })
  parentHidden!: boolean;

  @ApiProperty({
    format: 'date-time',
    description: 'Thời điểm cập nhật bản ghi trong DB (ISO 8601)',
  })
  updatedAt!: string;
}
