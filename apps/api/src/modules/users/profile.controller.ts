import { Body, Controller, Get, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthGuard, CurrentUser, type CurrentUserType } from '../auth/index.js';
import { ProfileResponse, UpdateProfileRequest } from './dto/profile.dto.js';
import { NoStoreInterceptor } from './no-store.interceptor.js';
import { ProfileService } from './profile.service.js';

/**
 * Ho so cua chinh minh: chi can dang nhap (AuthGuard), khong can vai nao. Phan hoi co PII nen
 * `Cache-Control: no-store`, cung interceptor voi API quan tri.
 */
@ApiTags('users')
@Controller('users/me')
@UseGuards(AuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiUnauthorizedResponse({ description: 'Chua dang nhap hoac phien khong con hop le' })
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Xem ho so cua chinh minh' })
  @ApiOkResponse({ type: ProfileResponse })
  get(@CurrentUser() user: CurrentUserType): Promise<ProfileResponse> {
    return this.profiles.get(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Sua ho ten va so dien thoai cua chinh minh (sua mot phan)' })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiBadRequestResponse({ description: 'Du lieu sai hoac co truong khong duoc phep sua' })
  update(
    @CurrentUser() user: CurrentUserType,
    @Body() request: UpdateProfileRequest,
  ): Promise<ProfileResponse> {
    return this.profiles.update(user.id, request);
  }
}
