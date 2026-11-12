import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType } from '../auth/index.js';
import { ReviewListResponse, ReviewSummaryResponse } from './dto/review.response.js';
import { ProductSlugParam } from './dto/review-input.dto.js';
import { ListProductReviewsQuery } from './dto/review-query.dto.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller('products/:slug/reviews')
@ApiNotFoundResponse({ description: 'San pham khong ton tai hoac dang an' })
@ApiBadRequestResponse({ description: 'Slug hoac tham so loc khong hop le' })
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Diem trung binh, phan bo 5 muc sao, so co anh/co chu va do vua' })
  @ApiOkResponse({ type: ReviewSummaryResponse })
  summary(@Param() { slug }: ProductSlugParam): Promise<ReviewSummaryResponse> {
    return this.reviews.summary(slug);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  // Tra viewerHasVoted, isOwn theo nguoi xem: proxy hay trinh duyet khong duoc giu ban dung chung.
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Danh gia da duyet cua san pham; dang nhap thi biet minh da bam huu ich chua',
  })
  @ApiOkResponse({ type: ReviewListResponse })
  @ApiUnauthorizedResponse({ description: 'Co gui token nhung token sai hoac het han' })
  list(
    @Param() { slug }: ProductSlugParam,
    @Query() query: ListProductReviewsQuery,
    @CurrentUser() viewer: CurrentUserType | undefined,
  ): Promise<ReviewListResponse> {
    return this.reviews.listForProduct(slug, query, viewer?.id ?? null);
  }
}
