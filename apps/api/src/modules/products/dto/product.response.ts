import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Hinh dang du lieu tra ve cho giao dien.
 *
 * price va imageUrl la cac truong response duoc suy ra tu Catalog normalized:
 * gia thap nhat cua phien ban dang ban va anh dau tien theo thu tu hien thi.
 */
export class ProductResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Gia thap nhat cua ProductVariant dang ban, don vi dong, dang chuoi' }) price!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'URL ProductImage dau tien theo sort_order; null neu chua co anh',
  })
  imageUrl!: string | null;
  @ApiProperty() categoryName!: string;
  @ApiProperty() categorySlug!: string;
}

export class ProductListResponse {
  @ApiProperty({ type: [ProductResponse] }) items!: ProductResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
}
