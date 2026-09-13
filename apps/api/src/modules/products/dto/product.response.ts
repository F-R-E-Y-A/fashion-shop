import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Hinh dang du lieu tra ve cho giao dien.
 *
 * Vi sao khong tra thang doi tuong cua Prisma: cot price la kieu Decimal,
 * chuyen thang sang JSON se ra mot doi tuong la. O day doi tuong minh bach
 * thanh chuoi, giao dien tu quyet dinh cach hien thi.
 */
export class ProductResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Gia ban, don vi dong, dang chuoi' }) price!: string;
  @ApiPropertyOptional({ nullable: true }) imageUrl!: string | null;
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
