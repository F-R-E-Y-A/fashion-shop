import { describe, expect, it } from 'vitest';

import { REFRESH_TOKEN_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie.js';

describe('refresh cookie contract', () => {
  it('uses an HttpOnly auth-scoped cookie and only enables Secure in production', () => {
    expect(REFRESH_TOKEN_COOKIE_NAME).toBe('refresh_token');
    expect(refreshCookieOptions('30d', false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 2_592_000_000,
    });
    expect(refreshCookieOptions('30d', true).secure).toBe(true);
  });
});
