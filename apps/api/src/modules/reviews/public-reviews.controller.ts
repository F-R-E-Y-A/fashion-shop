import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PublicReviewsResponse } from './dto/public-reviews.response.js';
import { PublicReviewsQueryDto } from './dto/public-reviews-query.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller('products/:slug/reviews')
export class PublicReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lấy danh sách đánh giá công khai đã được duyệt của sản phẩm' })
  @ApiOkResponse({
    description: 'Danh sách đánh giá đã duyệt theo phân trang',
    type: PublicReviewsResponse,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy sản phẩm hoặc sản phẩm bị ẩn' })
  async getPublicReviews(
    @Param('slug') slug: string,
    @Query() query: PublicReviewsQueryDto,
  ): Promise<PublicReviewsResponse> {
    return this.reviewsService.getPublicProductReviews(slug, query);
  }
}
