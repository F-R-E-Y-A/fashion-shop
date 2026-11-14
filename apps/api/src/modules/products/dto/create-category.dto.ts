import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_MAX_INT32 = 2_147_483_647;

export function IsTrimmedCategoryName(min = 2, max = 120, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTrimmedCategoryName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const trimmed = value.trim();
          return trimmed.length >= min && trimmed.length <= max;
        },
        defaultMessage(_args: ValidationArguments) {
          return `name phải có độ dài từ ${min} đến ${max} ký tự sau khi bỏ khoảng trắng đầu/cuối`;
        },
      },
    });
  };
}

export function IsStrictNonNegativeInt32(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrictNonNegativeInt32',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= CATEGORY_MAX_INT32
          );
        },
        defaultMessage(_args: ValidationArguments) {
          return `sortOrder phải là số nguyên từ 0 đến ${CATEGORY_MAX_INT32}`;
        },
      },
    });
  };
}

export function IsCategorySlug(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCategorySlug',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return value.length >= 2 && value.length <= 120 && CATEGORY_SLUG_REGEX.test(value);
        },
        defaultMessage(_args: ValidationArguments) {
          return 'slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang (-), độ dài 2–120 ký tự';
        },
      },
    });
  };
}

export class CreateCategoryDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 do client sinh để bảo đảm idempotency' })
  @IsUUID('4', { message: 'id phải là UUID v4 hợp lệ' })
  id!: string;

  @ApiProperty({ description: 'Tên danh mục (2–120 ký tự)' })
  @IsString({ message: 'name phải là chuỗi' })
  @IsTrimmedCategoryName(2, 120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Slug URL (2–120 ký tự thường/số/gạch ngang). Bỏ trống sẽ tự sinh từ name.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsCategorySlug()
  slug?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'UUID danh mục cha cấp 1, hoặc null nếu là danh mục gốc',
  })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID('4', { message: 'parentId phải là UUID v4 hợp lệ' })
  parentId?: string | null;

  @ApiPropertyOptional({
    description: 'Thứ tự hiển thị (>= 0, số nguyên Int32)',
    default: 0,
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsStrictNonNegativeInt32()
  sortOrder?: number;
}
