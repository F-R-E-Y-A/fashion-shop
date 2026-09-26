import type { CookieOptions } from 'express';

import { durationToMilliseconds } from './auth-timing.js';

export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

function refreshCookieBaseOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/api/auth',
  };
}

/** Cookie scope intentionally covers refresh and logout, but no unrelated API endpoints. */
export function refreshCookieOptions(
  refreshTokenTtl: string,
  isProduction: boolean,
): CookieOptions {
  return {
    ...refreshCookieBaseOptions(isProduction),
    maxAge: durationToMilliseconds(refreshTokenTtl),
  };
}

/** Uses the same scoped options as issuance so the browser removes the intended cookie. */
export function clearRefreshCookieOptions(isProduction: boolean): CookieOptions {
  return refreshCookieBaseOptions(isProduction);
}

/** Reads only the refresh cookie from the raw request header; no body transport is accepted. */
export function refreshTokenFromCookieHeader(cookieHeader: string | undefined): string | undefined {
  const cookie = cookieHeader
    ?.split(/;\s*/u)
    .find((value) => value.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`));
  const refreshToken = cookie?.slice(REFRESH_TOKEN_COOKIE_NAME.length + 1);
  return refreshToken || undefined;
}
