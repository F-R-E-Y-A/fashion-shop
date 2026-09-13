import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';
import { ProductsService } from './products.service.js';

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
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Liet ke san pham dang ban, co phan trang' })
  @ApiOkResponse({ type: ProductListResponse })
  list(@Query() query: ListProductsQuery): Promise<ProductListResponse> {
    return this.products.list(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Xem mot san pham theo duong dan rut gon' })
  @ApiOkResponse({ type: ProductResponse })
  findOne(@Param('slug') slug: string): Promise<ProductResponse> {
    return this.products.findBySlug(slug);
  }
}
