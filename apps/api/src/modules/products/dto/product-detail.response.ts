import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ProductResponse } from './product.response.js';

export class CategoryCrumbResponse {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class ProductColorResponse {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) hex!: string | null;
}

export class ProductImageResponse {
  @ApiProperty() url!: string;
  @ApiPropertyOptional({ nullable: true }) alt!: string | null;
  @ApiPropertyOptional({ nullable: true }) colorCode!: string | null;
}

export class ProductVariantResponse {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() colorCode!: string;
  @ApiProperty() sizeCode!: string;
  @ApiProperty() price!: string;
  @ApiPropertyOptional({ nullable: true }) listPrice!: string | null;
}

export class ProductDetailResponse extends ProductResponse {
  @ApiPropertyOptional({ nullable: true }) material!: string | null;
  @ApiPropertyOptional({ nullable: true }) careInstructions!: string | null;
  @ApiProperty({ type: [CategoryCrumbResponse] }) breadcrumb!: CategoryCrumbResponse[];
  @ApiProperty({ type: [ProductColorResponse] }) colors!: ProductColorResponse[];
  @ApiProperty({ type: [ProductImageResponse] }) images!: ProductImageResponse[];
  @ApiProperty({ type: [ProductVariantResponse] }) variants!: ProductVariantResponse[];
}
