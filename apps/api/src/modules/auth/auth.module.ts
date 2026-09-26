import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../../infra/config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { TokenService } from './token.service.js';

/** Phase 1 security primitives; HTTP endpoints are added in later PH3 phases. */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthGuard, AuthService, PasswordHasherService, TokenService],
  exports: [AuthGuard, AuthService, PasswordHasherService, TokenService],
})
export class AuthModule {}
