import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AdminProductIdParam {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'id phai la UUID' })
  id!: string;
}
export class AdminProductCategory {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() isActive!: boolean;
}
export class AdminProductBrand {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}
export class AdminProductSummary {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: AdminProductCategory }) category!: AdminProductCategory;
  @ApiProperty({ type: AdminProductBrand, nullable: true }) brand!: AdminProductBrand | null;
  @ApiProperty({ description: 'Gia tong hop dang luu, chuoi Decimal; khong dam bao gia mua duoc' })
  priceFrom!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, nullable: true }) imageUrl!: string | null;
  @ApiProperty({ description: 'Ngung ban thu cong, import khong tu go' }) adminDisabled!: boolean;
  @ApiProperty({ description: 'Phien ban don tang cua co/hold' }) statusVersion!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
export class AdminProductColor {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) hex!: string | null;
}
export class AdminProductVariant {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty({ type: AdminProductColor }) color!: AdminProductColor;
  @ApiProperty({ description: 'Ma co, ke ca FREE' }) sizeCode!: string;
  @ApiProperty() listPrice!: string;
  @ApiProperty({ type: String, nullable: true }) salePrice!: string | null;
  @ApiProperty() isActive!: boolean;
}
export class AdminProductImage {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) alt!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: AdminProductColor, nullable: true }) color!: AdminProductColor | null;
}
export class AdminProductDetail extends AdminProductSummary {
  @ApiProperty() contentVersion!: number;
  @ApiProperty({ type: [String] }) adminContentFields!: string[];
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: String, nullable: true }) material!: string | null;
  @ApiProperty({ type: String, nullable: true }) careInstructions!: string | null;
  @ApiProperty() isFeatured!: boolean;
  @ApiProperty({ type: String, nullable: true }) audience!: string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [AdminProductVariant] }) variants!: AdminProductVariant[];
  @ApiProperty({ type: [AdminProductImage] }) images!: AdminProductImage[];
}
export class AdminProductPage {
  @ApiProperty({ type: [AdminProductSummary] }) items!: AdminProductSummary[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}
