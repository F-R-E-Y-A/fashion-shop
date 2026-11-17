import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { PageQuery } from '../../common/pagination/page.query.js';
import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import {
  ReturnEligibilityResponse,
  ReturnListResponse,
  ReturnResponse,
} from './dto/return.response.js';
import { CreateReturnRequest, ReturnIdParam } from './dto/return-input.dto.js';
import { ReturnsService } from './returns.service.js';

/** Gui yeu cau tu trang don; than chua thong tin don cua khach nen moi duong dan deu no-store. */
@ApiTags('returns')
@Controller('orders/:id/returns')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiBadRequestResponse({ description: 'Than hoac tham so khong hop le' })
export class OrderReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('eligibility')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Don nay tra duoc khong, han tra, cach hoan, cac mon da mua' })
  @ApiOkResponse({ type: ReturnEligibilityResponse })
  @ApiNotFoundResponse({ description: 'Khong phai don cua minh' })
  eligibility(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReturnIdParam,
  ): Promise<ReturnEligibilityResponse> {
    return this.returns.eligibility(id, user.id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Gui yeu cau tra hang (UC-14.1)' })
  @ApiCreatedResponse({ type: ReturnResponse })
  @ApiBadRequestResponse({
    description:
      'INVALID_RETURN_ITEMS, RETURN_PHOTO_REQUIRED, REFUND_ACCOUNT_REQUIRED, INVALID_MEDIA',
  })
  @ApiConflictResponse({ description: 'RETURN_NOT_ALLOWED, RETURN_WINDOW_CLOSED, RETURN_EXISTS' })
  create(
    @CurrentUser() user: CurrentUserType,
    @Param() { id }: ReturnIdParam,
    @Body() input: CreateReturnRequest,
  ): Promise<ReturnResponse> {
    return this.returns.create(id, user.id, input);
  }
}

@ApiTags('returns')
@Controller('returns')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiBadRequestResponse({ description: 'Tham so khong hop le' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Yeu cau tra hang cua toi, moi nhat truoc' })
  @ApiOkResponse({ type: ReturnListResponse })
  list(@CurrentUser() user: CurrentUserType, @Query() query: PageQuery) {
    return this.returns.list(user.id, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ReturnResponse })
  @ApiNotFoundResponse({ description: 'RETURN_NOT_FOUND (ke ca yeu cau cua nguoi khac)' })
  get(@CurrentUser() user: CurrentUserType, @Param() { id }: ReturnIdParam) {
    return this.returns.get(id, user.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Huy khi shop chua duyet' })
  @ApiOkResponse({ type: ReturnResponse })
  @ApiNotFoundResponse({ description: 'RETURN_NOT_FOUND' })
  @ApiConflictResponse({ description: 'RETURN_STATE_CHANGED: shop da xu ly' })
  cancel(@CurrentUser() user: CurrentUserType, @Param() { id }: ReturnIdParam) {
    return this.returns.cancel(id, user.id);
  }
}
