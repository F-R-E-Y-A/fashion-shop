import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export const SKU_REGEX = /^[A-Za-z0-9_-]+$/;

export function IsValidMoneyString(
  options?: { allowZero?: boolean },
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidMoneyString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          if (!/^\d+(\.\d{1,2})?$/.test(value)) return false;
          const num = Number(value);
          if (!Number.isFinite(num)) return false;
          if (options?.allowZero ? num < 0 : num <= 0) return false;
          if (num > 999_999_999) return false;
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} phải là chuỗi số tiền hợp lệ (> 0 và <= 999.999.999, tối đa 2 chữ số thập phân)`;
        },
      },
    });
  };
}

export class CreateProductVariantDto {
  @ApiProperty({ format: 'uuid', description: 'UUID v4 do client sinh để bảo đảm idempotency' })
  @IsUUID('4', { message: 'id phải là UUID v4 hợp lệ' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'UUID của màu sắc' })
  @IsUUID('all', { message: 'colorId phải là UUID hợp lệ' })
  colorId!: string;

  @ApiProperty({ format: 'uuid', description: 'UUID của kích cỡ' })
  @IsUUID('all', { message: 'sizeId phải là UUID hợp lệ' })
  sizeId!: string;

  @ApiProperty({ description: 'Mã SKU duy nhất toàn cục' })
  @IsString({ message: 'sku phải là chuỗi' })
  @MinLength(1, { message: 'sku không được để trống' })
  @MaxLength(60, { message: 'sku tối đa 60 ký tự' })
  @Matches(SKU_REGEX, {
    message: 'sku chỉ gồm ký tự chữ, số, dấu gạch ngang (-) hoặc gạch dưới (_)',
  })
  sku!: string;

  @ApiProperty({ description: 'Giá niêm yết (chuỗi Decimal > 0, <= 999.999.999)' })
  @IsNotEmpty({ message: 'listPrice không được để trống' })
  @IsValidMoneyString()
  listPrice!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Giá bán / giảm (< listPrice, hoặc null nếu không giảm)',
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsValidMoneyString()
  salePrice?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Trạng thái kinh doanh của biến thể' })
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive?: boolean;
}
