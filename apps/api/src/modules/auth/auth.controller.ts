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
import {
  AuthenticatedUserResponse,
  AuthResponse,
  ForgotPasswordResponse,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  VerifyEmailResponse,
} from './dto/auth.response.js';
import { LoginRequest, RegisterRequest } from './dto/auth-credentials.request.js';
import { ForgotPasswordRequest } from './dto/forgot-password.request.js';
import { ResendVerificationRequest } from './dto/resend-verification.request.js';
import { ResetPasswordRequest } from './dto/reset-password.request.js';
import { VerifyEmailRequest } from './dto/verify-email.request.js';
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
  @ApiOperation({
    summary: 'Dang ky tai khoan, gui OTP xac thuc email. Khong cap phien dang nhap.',
  })
  @ApiCreatedResponse({ type: RegisterResponse })
  @ApiBadRequestResponse({ description: 'Email hoac mat khau khong hop le' })
  @ApiConflictResponse({ description: 'Email da duoc su dung' })
  async register(@Body() request: RegisterRequest): Promise<RegisterResponse> {
    return this.auth.register(request);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xac thuc email bang OTP 6 chu so, chuyen tai khoan sang ACTIVE' })
  @ApiOkResponse({ type: VerifyEmailResponse })
  @ApiBadRequestResponse({
    description: 'Ma xac thuc khong dung, da het han, hoac vuot qua so lan thu',
  })
  async verifyEmail(@Body() request: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return this.auth.verifyEmail(request);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gui lai OTP xac thuc email; luon tra ve phan hoi chung chung' })
  @ApiOkResponse({ type: ResendVerificationResponse })
  async resendVerification(
    @Body() request: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    return this.auth.resendVerification(request);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yeu cau OTP dat lai mat khau; luon tra ve phan hoi chung chung' })
  @ApiOkResponse({ type: ForgotPasswordResponse })
  async forgotPassword(@Body() request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    return this.auth.forgotPassword(request);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dat lai mat khau bang OTP; khong cap phien dang nhap' })
  @ApiOkResponse({ type: ResetPasswordResponse })
  @ApiBadRequestResponse({
    description: 'Ma OTP khong dung/het han/vuot qua so lan thu, hoac mat khau moi khong hop le',
  })
  async resetPassword(@Body() request: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    return this.auth.resetPassword(request);
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
