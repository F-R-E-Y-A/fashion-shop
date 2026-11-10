import { expect } from 'vitest';

import type { TestApp } from './create-test-app.js';

export const PASSWORD = 'Password123';

/** Lay refresh token tho ra khoi header Set-Cookie (chi test moi can), khong dung o ma that. */
export function refreshCookieValue(headers: Record<string, unknown>): string {
  const cookies = headers['set-cookie'];
  const cookie = Array.isArray(cookies)
    ? (cookies as string[]).find((entry) => entry.startsWith('refresh_token='))
    : undefined;
  if (!cookie) throw new Error('Missing refresh_token cookie');
  return cookie.slice('refresh_token='.length).split(';', 1)[0] ?? '';
}

/**
 * Cac buoc auth dung lai o nhieu bai test. `ip` gia lap IP khach qua X-Forwarded-For (test chay voi
 * TRUST_PROXY_HOPS=1, nen nhan dia chi cuoi cung cua header).
 */
export function authFlows(t: TestApp) {
  const withIp = (request: import('supertest').Test, ip?: string) =>
    ip ? request.set('X-Forwarded-For', ip) : request;

  async function registerPending(email: string): Promise<string> {
    await t.http.post('/api/auth/register').send({ email, password: PASSWORD }).expect(201);
    const code = t.mail.lastCodeSentTo(email.trim().toLowerCase());
    if (!code) throw new Error(`No verification email captured for ${email}`);
    return code;
  }

  function login(email: string, password = PASSWORD, ip?: string) {
    return withIp(t.http.post('/api/auth/login').send({ email, password }), ip);
  }

  /** Dang ky + xac thuc bang OTP that + dang nhap: tra ve phien dau tien (mot family moi). */
  async function activateAndLogin(email: string) {
    const code = await registerPending(email);
    await t.http.post('/api/auth/verify-email').send({ email, code }).expect(200);
    const response = await login(email).expect(200);
    return {
      id: response.body.user.id as string,
      accessToken: response.body.accessToken as string,
      refreshToken: refreshCookieValue(response.headers),
    };
  }

  /** Dang nhap them mot lan: mot family refresh token MOI cho cung nguoi dung. */
  async function loginAgain(email: string) {
    const response = await login(email).expect(200);
    return {
      accessToken: response.body.accessToken as string,
      refreshToken: refreshCookieValue(response.headers),
    };
  }

  function refresh(refreshToken: string) {
    return t.http.post('/api/auth/refresh').set('Cookie', `refresh_token=${refreshToken}`);
  }

  function me(accessToken: string) {
    return t.http.get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
  }

  async function requestPasswordReset(email: string): Promise<string> {
    await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
    const code = t.mail.lastCodeSentTo(email);
    if (!code) throw new Error(`No password-reset email captured for ${email}`);
    return code;
  }

  /** 429 chuan: dung ma loi, co Retry-After hop le, than khong lo them truong nao. */
  function expectRateLimited(response: {
    status: number;
    body: Record<string, unknown>;
    headers: Record<string, unknown>;
  }) {
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'message',
      'path',
      'statusCode',
      'timestamp',
    ]);
    const retryAfter = Number(response.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  }

  return {
    registerPending,
    login,
    activateAndLogin,
    loginAgain,
    refresh,
    me,
    requestPasswordReset,
    expectRateLimited,
    withIp,
  };
}
