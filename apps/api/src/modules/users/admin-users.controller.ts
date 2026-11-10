import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { CurrentUser, type CurrentUserType, RequireRoles, RoleCode } from '../auth/index.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminUserListResponse, AdminUserResponse } from './dto/admin-user.response.js';
import { AdminUserIdParam } from './dto/admin-user-id.param.js';
import { ListAdminUsersQuery } from './dto/list-admin-users.query.js';
import { NoStoreInterceptor } from './no-store.interceptor.js';

/**
 * API quan tri tai khoan, tien to /api/admin/* (quy uoc T-M5). RequireRoles gan o cap class nen moi
 * duong dan them vao day tu dong can ADMIN; them method moi khong the quen chan quyen.
 * Guard chay truoc ValidationPipe: nguoi khong du quyen nhan 401/403 truoc khi id hay page bi kiem.
 */
@ApiTags('admin-users')
@Controller('admin/users')
@RequireRoles(RoleCode.ADMIN)
@UseInterceptors(NoStoreInterceptor)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Liet ke tai khoan cho quan tri vien: tim email, loc trang thai/vai/xac thuc, sap xep',
  })
  @ApiOkResponse({ type: AdminUserListResponse })
  list(@Query() query: ListAdminUsersQuery): Promise<AdminUserListResponse> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem mot tai khoan theo id cho quan tri vien' })
  @ApiOkResponse({ type: AdminUserResponse })
  @ApiNotFoundResponse({ description: 'Khong co tai khoan voi id nay' })
  findOne(@Param() { id }: AdminUserIdParam): Promise<AdminUserResponse> {
    return this.users.findById(id);
  }

  // Dong tu nghiep vu (POST .../lock) thay vi PATCH truong status, theo docs/shared/api.md.
  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khoa tai khoan ACTIVE: vo hieu moi access token va refresh token hien co',
  })
  @ApiOkResponse({ type: AdminUserResponse })
  @ApiNotFoundResponse({ description: 'Khong co tai khoan voi id nay' })
  @ApiConflictResponse({ description: 'USER_NOT_ACTIVE: tai khoan khong o trang thai ACTIVE' })
  @ApiUnprocessableEntityResponse({ description: 'CANNOT_LOCK_SELF: tu khoa chinh minh' })
  lock(
    @Param() { id }: AdminUserIdParam,
    @CurrentUser() actor: CurrentUserType,
  ): Promise<AdminUserResponse> {
    return this.users.lock(actor.id, id);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mo khoa tai khoan LOCKED; khong cap phien moi, nguoi dung phai dang nhap lai',
  })
  @ApiOkResponse({ type: AdminUserResponse })
  @ApiNotFoundResponse({ description: 'Khong co tai khoan voi id nay' })
  @ApiConflictResponse({ description: 'USER_NOT_LOCKED: tai khoan khong o trang thai LOCKED' })
  unlock(
    @Param() { id }: AdminUserIdParam,
    @CurrentUser() actor: CurrentUserType,
  ): Promise<AdminUserResponse> {
    return this.users.unlock(actor.id, id);
  }
}
