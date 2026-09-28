import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../infra/config/env.js';
import { TokenService } from './token.service.js';

const config = {
  get(key: keyof Env): string {
    const values = {
      JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-characters',
      JWT_ACCESS_TTL: '15m',
      REFRESH_TOKEN_TTL: '30d',
    };
    return values[key as keyof typeof values] ?? '';
  },
};

function createService(): TokenService {
  return new TokenService(
    new JwtService({ secret: config.get('JWT_ACCESS_SECRET') }),
    config as never,
  );
}

describe('TokenService', () => {
  it('signs and verifies an access token with only the subject claim', async () => {
    const service = createService();

    const token = await service.signAccessToken('user-123');
    const payload = await service.verifyAccessToken(token);

    expect(payload.sub).toBe('user-123');
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('roles');
  });

  it('generates a raw refresh token and hashes it deterministically', () => {
    const service = createService();
    const refreshToken = service.generateRefreshToken();

    expect(refreshToken).not.toBe('');
    expect(service.hashRefreshToken(refreshToken)).not.toBe(refreshToken);
    expect(service.hashRefreshToken(refreshToken)).toBe(service.hashRefreshToken(refreshToken));
  });

  it('calculates refresh expiry from configured TTL', () => {
    const service = createService();
    const now = new Date('2026-09-26T00:00:00.000Z');

    expect(service.refreshTokenExpiresAt(now)).toEqual(new Date('2026-10-26T00:00:00.000Z'));
  });
});
