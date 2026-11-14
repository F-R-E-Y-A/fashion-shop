import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CatalogFacetsResponse } from '../search/dto/catalog-facets.response.js';
import { SearchInterpretationResponse } from '../search/dto/search-interpretation.response.js';

/**
 * Hinh dang du lieu tra ve cho giao dien.
 *
 * price va imageUrl la cac truong response duoc suy ra tu Catalog normalized:
 * gia thap nhat cua phien ban dang ban va anh dau tien theo thu tu hien thi.
 */
export class ProductResponse {
  @ApiProperty({ enum: ['IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN'] }) stockStatus?:
    'IN_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty({
    description:
      'Gia ban thap nhat trong cac bien the dang ban (products.price_from), don vi dong, dang chuoi',
  })
  price!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'URL ProductImage dau tien theo sort_order; null neu chua co anh',
  })
  imageUrl!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description:
      'URL anh thu hai theo sort_order, de doi anh khi re chuot; null neu chi co mot anh',
  })
  hoverImageUrl!: string | null;
  @ApiProperty() categoryName!: string;
  @ApiProperty() categorySlug!: string;
  @ApiPropertyOptional({ nullable: true }) brandName!: string | null;
  @ApiPropertyOptional({ nullable: true }) listPrice!: string | null;
  @ApiProperty({
    type: [String],
    description: 'Ma mau hien thi cua ho mau cac bien the dang ban, toi da 4, khong lap',
  })
  colorSwatches!: string[];
  @ApiProperty({ description: 'So ten mau khac nhau dang ban, khong tinh mau mac dinh' })
  colorCount!: number;
  @ApiProperty({ description: 'Trung binh sao cua danh gia da duyet, 2 chu so; 0 khi chua co' })
  ratingAverage!: number;
  @ApiProperty({ description: 'So danh gia da duyet' })
  ratingCount!: number;
}

export class ProductListResponse {
  @ApiProperty({ type: [ProductResponse] }) items!: ProductResponse[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() totalPages!: number;
  @ApiPropertyOptional({
    type: SearchInterpretationResponse,
    description: 'Chi co khi co tham so search',
  })
  interpretation?: SearchInterpretationResponse;
  @ApiPropertyOptional({
    type: [String],
    description:
      'Chi co khi co tham so search. Nhan cac buoc da noi truy van vi khong co san pham khop du cac y; rong neu khong phai noi',
  })
  relaxed?: string[];
  @ApiPropertyOptional({
    enum: ['hybrid', 'rules'],
    description:
      'Chi co khi co tham so search. hybrid: xep gop luat va ngu nghia (ADR-048); rules: chi theo luat (tat, chua san sang, loi hay xep theo gia)',
  })
  ranking?: 'hybrid' | 'rules';
  @ApiPropertyOptional({
    type: CatalogFacetsResponse,
    description: 'Chi co khi facets=true',
  })
  facets?: CatalogFacetsResponse;
}
