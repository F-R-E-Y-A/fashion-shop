import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType, RequireRoles, RoleCode } from '../auth/index.js';
import { AdminReviewsService } from './admin-reviews.service.js';
import {
  ApproveReviewRequest,
  RejectReviewRequest,
  ReplyReviewRequest,
} from './dto/admin-review-input.dto.js';
import { AdminReviewListResponse, AdminReviewResponse } from './dto/review.response.js';
import { ReviewIdParam } from './dto/review-input.dto.js';
import { ListAdminReviewsQuery } from './dto/review-query.dto.js';

/** Than tra ve co email nguoi viet: moi duong dan deu no-store. */
@ApiTags('admin-reviews')
@Controller('admin/reviews')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiForbiddenResponse({ description: 'Can vai tro ADMIN' })
@ApiBadRequestResponse({ description: 'Query/body/UUID khong hop le; tham so la bi tu choi' })
export class AdminReviewsController {
  constructor(private readonly reviews: AdminReviewsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Hang danh gia: loc trang thai, bi bao cao, so sao; tim chu, email, ten san pham',
  })
  @ApiOkResponse({ type: AdminReviewListResponse })
  list(@Query() query: ListAdminReviewsQuery): Promise<AdminReviewListResponse> {
    return this.reviews.list(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Duyet hien danh gia va tinh lai diem san pham' })
  @ApiOkResponse({ type: AdminReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @ApiConflictResponse({ description: 'REVIEW_CHANGED: nguoi viet vua sua, tai lai roi duyet' })
  approve(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReviewIdParam,
    @Body() request: ApproveReviewRequest,
  ): Promise<AdminReviewResponse> {
    return this.reviews.approve(actor.id, id, request.editCount);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'An danh gia kem ly do bat buoc; nguoi viet thay ly do' })
  @ApiOkResponse({ type: AdminReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  @ApiConflictResponse({ description: 'REVIEW_ALREADY_REJECTED, REVIEW_CHANGED' })
  reject(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReviewIdParam,
    @Body() request: RejectReviewRequest,
  ): Promise<AdminReviewResponse> {
    return this.reviews.reject(actor.id, id, request.note, request.editCount);
  }

  @Put(':id/reply')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Phan hoi cua shop (mot phan hoi moi danh gia, gui lai la sua)' })
  @ApiOkResponse({ type: AdminReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  reply(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReviewIdParam,
    @Body() request: ReplyReviewRequest,
  ): Promise<AdminReviewResponse> {
    return this.reviews.reply(actor.id, id, request.content);
  }

  @Delete(':id/reply')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Go phan hoi cua shop' })
  @ApiOkResponse({ type: AdminReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  removeReply(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReviewIdParam,
  ): Promise<AdminReviewResponse> {
    return this.reviews.removeReply(actor.id, id);
  }

  @Post(':id/clear-reports')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Bao cao sai: xoa het bao cao cua danh gia' })
  @ApiOkResponse({ type: AdminReviewResponse })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND' })
  clearReports(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReviewIdParam,
  ): Promise<AdminReviewResponse> {
    return this.reviews.clearReports(actor.id, id);
  }
}
