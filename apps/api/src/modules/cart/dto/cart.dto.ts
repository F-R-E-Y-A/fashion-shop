import { IsBoolean, IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class AddToCartDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  quantity?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isSelected?: boolean;

  /** Doi dong gio sang bien the khac CUNG san pham (doi mau, co). Khong gui kem quantity, isSelected. */
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  toVariantId?: string;
}
