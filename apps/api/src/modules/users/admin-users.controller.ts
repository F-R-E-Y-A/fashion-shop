import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PageQuery } from '../../common/pagination/page.query.js';
import { RequireRoles, RoleCode } from '../auth/index.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminUserListResponse, AdminUserResponse } from './dto/admin-user.response.js';
import { AdminUserIdParam } from './dto/admin-user-id.param.js';
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
  @ApiOperation({ summary: 'Liet ke tai khoan cho quan tri vien, moi nhat truoc, co phan trang' })
  @ApiOkResponse({ type: AdminUserListResponse })
  list(@Query() query: PageQuery): Promise<AdminUserListResponse> {
    return this.users.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem mot tai khoan theo id cho quan tri vien' })
  @ApiOkResponse({ type: AdminUserResponse })
  @ApiNotFoundResponse({ description: 'Khong co tai khoan voi id nay' })
  findOne(@Param() { id }: AdminUserIdParam): Promise<AdminUserResponse> {
    return this.users.findById(id);
  }
}
