import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import type { Env } from '../../infra/config/env.js';
import { AuthService } from './auth.service.js';
import { AuthResponse } from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import { REFRESH_TOKEN_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

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
