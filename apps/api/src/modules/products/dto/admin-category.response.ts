import { ApiProperty } from '@nestjs/swagger';

export class AdminCategoryParentSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description: 'Trạng thái hiển thị hiệu lực của danh mục cha trên Storefront',
  })
  effectiveActive!: boolean;
}

export class AdminCategoryChildSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description: 'Trạng thái hiển thị hiệu lực trên Storefront',
  })
  effectiveActive!: boolean;

  @ApiProperty({
    description: 'true nếu danh mục cha bị ẩn làm con không hiển thị hiệu lực',
  })
  parentHidden!: boolean;

  @ApiProperty({
    description: 'Tổng số sản phẩm gắn trực tiếp vào danh mục (kể cả sản phẩm ẩn)',
  })
  productCount!: number;

  @ApiProperty({
    description: 'Tổng số sản phẩm thuộc danh mục và toàn bộ nhánh con',
  })
  subtreeProductCount!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminCategoryNode {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  parentId!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description: 'Trạng thái hiển thị hiệu lực trên Storefront',
  })
  effectiveActive!: boolean;

  @ApiProperty({
    description: 'true nếu danh mục cha bị ẩn làm con không hiển thị hiệu lực',
  })
  parentHidden!: boolean;

  @ApiProperty({
    description: 'Tổng số sản phẩm gắn trực tiếp vào danh mục (kể cả sản phẩm ẩn)',
  })
  productCount!: number;

  @ApiProperty({
    description: 'Tổng số sản phẩm thuộc danh mục và toàn bộ nhánh con',
  })
  subtreeProductCount!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: () => [AdminCategoryNode] })
  children!: AdminCategoryNode[];
}

export class AdminCategoryDetail {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ type: String, nullable: true })
  parentId!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description: 'Trạng thái hiển thị hiệu lực trên Storefront',
  })
  effectiveActive!: boolean;

  @ApiProperty({
    description: 'true nếu danh mục cha bị ẩn làm nhánh con không hiển thị hiệu lực',
  })
  parentHidden!: boolean;

  @ApiProperty({
    description: 'Tổng số sản phẩm gắn trực tiếp vào danh mục (kể cả sản phẩm ẩn)',
  })
  productCount!: number;

  @ApiProperty({
    description: 'Tổng số sản phẩm thuộc danh mục và toàn bộ nhánh con',
  })
  subtreeProductCount!: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({ type: AdminCategoryParentSummary, nullable: true })
  parent!: AdminCategoryParentSummary | null;

  @ApiProperty({ type: [AdminCategoryChildSummary] })
  children!: AdminCategoryChildSummary[];
}
