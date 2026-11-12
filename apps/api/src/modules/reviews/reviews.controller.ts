import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { PageQuery } from '../../common/pagination/page.query.js';
import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import {
  HelpfulVoteResponse,
  MyReviewListResponse,
  MyReviewResponse,
  ReviewableItemResponse,
} from './dto/review.response.js';
import {
  CreateReviewRequest,
  ReportReviewRequest,
  ReviewIdParam,
  UpdateReviewRequest,
} from './dto/review-input.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller('reviews')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiBadRequestResponse({ description: 'Than hoac tham so khong hop le; truong la bi tu choi' })
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('eligible')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Dong don da giao trong 30 ngay ma minh chua danh gia' })
  @ApiOkResponse({ type: [ReviewableItemResponse] })
  eligible(@CurrentUser() user: CurrentUserType): Promise<ReviewableItemResponse[]> {
    return this.reviews.reviewable(user.id);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Danh gia cua minh, ca dang cho duyet va bi an (kem ly do)' })
  @ApiOkResponse({ type: MyReviewListResponse })
  mine(
    @CurrentUser() user: CurrentUserType,
    @Query() query: PageQuery,
  ): Promise<MyReviewListResponse> {
    return this.reviews.mine(user.id, query);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Viet danh gia cho mot dong don da giao; co anh hoac chu can xem thi cho duyet',
  })
  @ApiCreatedResponse({ type: MyReviewResponse })
  @ApiNotFoundResponse({ description: 'ORDER_ITEM_NOT_FOUND: khong phai dong don cua minh' })
  @ApiConflictResponse({ description: 'REVIEW_ALREADY_EXISTS' })
  @ApiUnprocessableEntityResponse({
    description: 'REVIEW_NOT_ALLOWED, REVIEW_WINDOW_CLOSED, INVALID_MEDIA',
  })
  @ApiServiceUnavailableResponse({ description: 'Gui anh khi kho anh chua bat hoac dang loi' })
  create(
    @CurrentUser() user: CurrentUserType,
    @Body() request: CreateReviewRequest,
  ): Promise<MyReviewResponse> {
    return this.reviews.create(user.id, request);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sua danh gia mot lan trong 30 ngay; sua xong duyet lai' })
  @ApiOkResponse({ type: MyReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'REVIEW_NOT_EDITABLE, INVALID_MEDIA' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReviewIdParam,
    @Body() request: UpdateReviewRequest,
  ): Promise<MyReviewResponse> {
    return this.reviews.update(user.id, id, request);
  }

  @Post(':id/helpful')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bam huu ich; bam lai khong cong them' })
  @ApiOkResponse({ type: HelpfulVoteResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND hoac danh gia chua duyet' })
  @ApiUnprocessableEntityResponse({ description: 'OWN_REVIEW' })
  vote(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReviewIdParam,
  ): Promise<HelpfulVoteResponse> {
    return this.reviews.vote(user.id, id);
  }

  @Delete(':id/helpful')
  @ApiOperation({ summary: 'Bo bam huu ich; chua bam thi khong doi gi' })
  @ApiOkResponse({ type: HelpfulVoteResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  unvote(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReviewIdParam,
  ): Promise<HelpfulVoteResponse> {
    return this.reviews.unvote(user.id, id);
  }

  @Post(':id/report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bao cao danh gia vi pham; bao lai cung nguoi khong tinh them' })
  @ApiNoContentResponse({ description: 'Da ghi nhan' })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND hoac danh gia chua duyet' })
  @ApiUnprocessableEntityResponse({ description: 'OWN_REVIEW' })
  report(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReviewIdParam,
    @Body() request: ReportReviewRequest,
  ): Promise<void> {
    return this.reviews.report(user.id, id, request);
  }
}
