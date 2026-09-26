import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../../infra/config/env.js';
import { durationToMilliseconds } from './auth-timing.js';

export interface AccessTokenPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

/** Signs short-lived access tokens and prepares secure refresh-token persistence. */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(userId: string): Promise<string> {
    const expiresIn =
      durationToMilliseconds(this.config.get('JWT_ACCESS_TTL', { infer: true })) / 1_000;
    return this.jwt.signAsync({ sub: userId }, { expiresIn });
  }

  verifyAccessToken(accessToken: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(accessToken);
  }

  generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  refreshTokenExpiresAt(now = new Date()): Date {
    const ttl = durationToMilliseconds(this.config.get('REFRESH_TOKEN_TTL', { infer: true }));
    return new Date(now.getTime() + ttl);
  }
}
