import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';
import { ProductDetailResponse } from './dto/product-detail.response.js';
import { ProductSlugParam } from './dto/product-slug.param.js';
import { RelatedProductsQuery } from './dto/related-products.query.js';
import { ProductsService } from './products.service.js';
import { CatalogSearchService } from './search/catalog-search.service.js';
import { usesSearchEngine } from './search/uses-search-engine.js';

/**
 * Quy uoc duong dan chung cua du an:
 *   GET    /api/<phan-he>            liet ke, co phan trang
 *   GET    /api/<phan-he>/:dinh-danh mot ban ghi
 *   POST   /api/<phan-he>            tao moi
 *   PATCH  /api/<phan-he>/:id        sua mot phan
 *   DELETE /api/<phan-he>/:id        xoa
 * Ten phan he viet so nhieu, chu thuong, noi bang dau gach ngang.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly catalog: CatalogSearchService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Liet ke san pham dang ban, co phan trang; tim kiem, loc va so dem bo loc',
    description:
      'Co search, audience, categories, colors, sizes, minPrice, maxPrice, facets hoac sort=relevance thi di duong tim kiem (UC-03.2, UC-03.3); khong co thi liet ke co ban.',
  })
  @ApiOkResponse({ type: ProductListResponse })
  list(@Query() query: ListProductsQuery): Promise<ProductListResponse> {
    return usesSearchEngine(query) ? this.catalog.list(query) : this.products.list(query);
  }

  @Get(':slug/related')
  @ApiOperation({ summary: 'Sản phẩm cùng danh mục' })
  @ApiOkResponse({ type: ProductResponse, isArray: true })
  related(
    @Param() { slug }: ProductSlugParam,
    @Query() { limit }: RelatedProductsQuery,
  ): Promise<ProductResponse[]> {
    return this.products.related(slug, limit);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Chi tiết sản phẩm theo slug' })
  @ApiOkResponse({ type: ProductDetailResponse })
  findOne(@Param() { slug }: ProductSlugParam): Promise<ProductDetailResponse> {
    return this.products.findBySlug(slug);
  }
}
