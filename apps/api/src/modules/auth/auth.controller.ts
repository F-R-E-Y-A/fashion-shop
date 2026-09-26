import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { Env } from '../../infra/config/env.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import type { CurrentUserType } from './current-user.type.js';
import { AuthenticatedUserResponse, AuthResponse } from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import {
  clearRefreshCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
  refreshCookieOptions,
  refreshTokenFromCookieHeader,
} from './refresh-cookie.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Lay thong tin nguoi dung dang dang nhap' })
  @ApiOkResponse({ type: AuthenticatedUserResponse })
  @ApiUnauthorizedResponse({
    description: 'Access token khong hop le hoac tai khoan khong duoc phep',
  })
  me(@CurrentUser() user: CurrentUserType): CurrentUserType {
    return user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lam moi access token bang refresh cookie' })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({ description: 'Phien dang nhap khong hop le' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.refresh(refreshTokenFromCookieHeader(request.headers.cookie));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Dang xuat va huy refresh session hien tai' })
  @ApiNoContentResponse({ description: 'Da xoa refresh cookie va huy session neu con hieu luc' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(refreshTokenFromCookieHeader(request.headers.cookie));
    response.clearCookie(
      REFRESH_TOKEN_COOKIE_NAME,
      clearRefreshCookieOptions(this.config.get('NODE_ENV', { infer: true }) === 'production'),
    );
  }

  @Post('register')
  @ApiOperation({ summary: 'Dang ky tai khoan va tao phien dang nhap' })
  @ApiCreatedResponse({ type: AuthResponse })
  @ApiBadRequestResponse({ description: 'Email hoac mat khau khong hop le' })
  @ApiConflictResponse({ description: 'Email da duoc su dung' })
  async register(
    @Body() request: RegisterRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(request);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dang nhap va tao phien dang nhap moi' })
  @ApiOkResponse({ type: AuthResponse })
  @ApiBadRequestResponse({ description: 'Du lieu dang nhap khong hop le' })
  @ApiUnauthorizedResponse({ description: 'Email hoac mat khau khong dung' })
  async login(
    @Body() request: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(request);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE_NAME,
      refreshToken,
      refreshCookieOptions(
        this.config.get('REFRESH_TOKEN_TTL', { infer: true }),
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      ),
    );
  }
}
