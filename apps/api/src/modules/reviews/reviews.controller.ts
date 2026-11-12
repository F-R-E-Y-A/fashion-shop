import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import {
  OrderReviewItemDetails,
  OrderReviewsContextResponse,
} from './dto/order-review-context.response.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('orders/:orderId/reviews')
  @ApiOperation({ summary: 'Lấy ngữ cảnh đánh giá cho các dòng hàng trong đơn' })
  @ApiOkResponse({
    description: 'Danh sách dòng hàng và trạng thái đủ điều kiện/đã đánh giá',
    type: OrderReviewsContextResponse,
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy đơn hàng hoặc không thuộc quyền sở hữu' })
  async getOrderReviewContext(
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<OrderReviewsContextResponse> {
    return this.reviewsService.getOrderReviewContext(orderId, user.id);
  }

  @Post('reviews')
  @ApiOperation({ summary: 'Gửi đánh giá cho một dòng hàng đã giao' })
  @ApiCreatedResponse({
    description: 'Đánh giá đã được tạo ở trạng thái PENDING (hoặc trả row hiện có nếu idempotent)',
    type: OrderReviewItemDetails,
  })
  @ApiUnauthorizedResponse({ description: 'Chưa đăng nhập' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy dòng hàng hoặc không thuộc quyền sở hữu' })
  @ApiConflictResponse({
    description: 'Dòng hàng đã được đánh giá trước đó với nội dung khác, hoặc đã bị xóa',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Đơn hàng chưa từng giao thành công nên chưa thể đánh giá',
  })
  async createReview(@CurrentUser() user: CurrentUserType, @Body() dto: CreateReviewDto) {
    return this.reviewsService.createReview(user.id, dto);
  }
}
