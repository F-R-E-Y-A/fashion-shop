import { ApiProperty } from '@nestjs/swagger';

import { CategoryCrumbResponse } from './product-detail.response.js';

export class CategoryNodeResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({
    description:
      'So san pham hien thi duoc; danh muc cha tinh ca cac danh muc con. Giao dien an danh muc co 0',
  })
  productCount!: number;
  @ApiProperty({ type: () => CategoryNodeResponse, isArray: true })
  children!: CategoryNodeResponse[];
}

export class CategoryDetailResponse {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: [CategoryCrumbResponse] }) breadcrumb!: CategoryCrumbResponse[];
  @ApiProperty({ type: [CategoryCrumbResponse] }) children!: CategoryCrumbResponse[];
}
