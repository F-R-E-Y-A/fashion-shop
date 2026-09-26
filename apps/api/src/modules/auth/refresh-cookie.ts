import type { CookieOptions } from 'express';

import { durationToMilliseconds } from './auth-timing.js';

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

/** Cookie scope intentionally covers refresh and logout, but no unrelated API endpoints. */
export function refreshCookieOptions(
  refreshTokenTtl: string,
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: durationToMilliseconds(refreshTokenTtl),
  };
}
