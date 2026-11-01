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
}
