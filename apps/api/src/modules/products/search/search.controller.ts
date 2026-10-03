import { Controller, Get, Ip, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { CatalogSearchService } from './catalog-search.service.js';
import { SuggestQuery } from './dto/suggest.query.js';
import { SuggestResponse } from './dto/suggest.response.js';
import { SuggestRateLimitService } from './suggest-rate-limit.service.js';

/**
 * Duong dan rieng /api/search, khong nam trong /api/products de khong dung vao route `:slug`.
 * Tim kiem day du (co phan trang, loc, xep) dung GET /api/products?search=.
 */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly catalog: CatalogSearchService,
    private readonly rateLimit: SuggestRateLimitService,
  ) {}

  @Get('suggest')
  @ApiOperation({
    summary: 'Goi y cho o tim kiem toan cuc: san pham, danh muc, cau goi y',
  })
  @ApiOkResponse({ type: SuggestResponse })
  @ApiBadRequestResponse({ description: 'q ngan hon 2 hoac dai hon 120 ky tu' })
  @ApiTooManyRequestsResponse({
    description: 'Qua 60 lan moi phut tu mot IP; co header Retry-After',
  })
  async suggest(
    @Query() { q }: SuggestQuery,
    @Ip() ip: string | undefined,
  ): Promise<SuggestResponse> {
    await this.rateLimit.enforce(ip);
    return this.catalog.suggest(q);
  }
}
