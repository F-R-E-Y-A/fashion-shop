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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType, RequireRoles, RoleCode } from '../auth/index.js';
import { AdminReturnsService } from './admin-returns.service.js';
import { AdminReturnListResponse, AdminReturnResponse } from './dto/return.response.js';
import {
  ApproveReturnRequest,
  ListAdminReturnsQuery,
  RefundReturnRequest,
  RejectReturnRequest,
  ReturnIdParam,
} from './dto/return-input.dto.js';

/** Than tra ve co email va tai khoan nhan tien cua khach: moi duong dan deu no-store. */
@ApiTags('admin-returns')
@Controller('admin/returns')
@RequireRoles(RoleCode.ADMIN)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap' })
@ApiForbiddenResponse({ description: 'Can vai tro ADMIN' })
@ApiBadRequestResponse({ description: 'Query/body/UUID khong hop le' })
export class AdminReturnsController {
  constructor(private readonly returns: AdminReturnsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Hang yeu cau tra, loc theo trang thai, cu nhat truoc' })
  @ApiOkResponse({ type: AdminReturnListResponse })
  list(@Query() query: ListAdminReturnsQuery) {
    return this.returns.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReturnResponse })
  @ApiNotFoundResponse({ description: 'RETURN_NOT_FOUND' })
  detail(@Param() { id }: ReturnIdParam) {
    return this.returns.detail(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: AdminReturnResponse })
  @ApiConflictResponse({ description: 'RETURN_STATE_CHANGED' })
  approve(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReturnIdParam,
    @Body() input: ApproveReturnRequest,
  ) {
    return this.returns.approve(id, actor.id, input);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Tu choi kem ly do bat buoc; khach thay ly do' })
  @ApiOkResponse({ type: AdminReturnResponse })
  @ApiConflictResponse({ description: 'RETURN_STATE_CHANGED' })
  reject(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReturnIdParam,
    @Body() input: RejectReturnRequest,
  ) {
    return this.returns.reject(id, actor.id, input);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Hang tra da ve kho: cong kho tung mon, mot lan' })
  @ApiOkResponse({ type: AdminReturnResponse })
  @ApiConflictResponse({ description: 'RETURN_STATE_CHANGED' })
  receive(@Param() { id }: ReturnIdParam) {
    return this.returns.receive(id);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Hoan tien: online qua cong; COD nhap ma chuyen khoan da hoan',
  })
  @ApiOkResponse({ type: AdminReturnResponse })
  @ApiBadRequestResponse({ description: 'TRANSFER_REFERENCE_REQUIRED' })
  @ApiConflictResponse({ description: 'RETURN_STATE_CHANGED, REFUND_PENDING' })
  @ApiServiceUnavailableResponse({
    description: 'REFUND_PENDING: cong khong tra loi, lenh giu cho doi soat o trang don',
  })
  refund(
    @CurrentUser() actor: CurrentUserType,
    @Param() { id }: ReturnIdParam,
    @Body() input: RefundReturnRequest,
  ) {
    return this.returns.refund(id, actor.id, input);
  }
}
