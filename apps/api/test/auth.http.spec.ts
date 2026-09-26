import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UserStatus } from '../src/generated/prisma/client.js';
import { PasswordHasherService } from '../src/modules/auth/password-hasher.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const password = 'Password123';

function refreshTokenFrom(headers: Record<string, unknown>): string {
  const cookies = headers['set-cookie'];
  const refreshCookie = Array.isArray(cookies)
    ? cookies.find((cookie) => cookie.startsWith('refresh_token='))
    : undefined;
  if (!refreshCookie) throw new Error('Missing refresh_token cookie');
  return refreshCookie.slice('refresh_token='.length).split(';', 1)[0] ?? '';
}

function expectRefreshCookie(headers: Record<string, unknown>): string {
  const cookies = headers['set-cookie'];
  expect(Array.isArray(cookies)).toBe(true);
  const refreshCookie = (cookies as string[]).find((cookie) => cookie.startsWith('refresh_token='));
  expect(refreshCookie).toContain('HttpOnly');
  expect(refreshCookie).toContain('SameSite=Lax');
  expect(refreshCookie).toContain('Path=/api/auth');
  return refreshTokenFrom(headers);
}

function expectPublicAuthenticationResponse(body: unknown): void {
  expect(body).toEqual({
    accessToken: expect.any(String),
    user: {
      id: expect.any(String),
      email: expect.any(String),
      roles: ['CUSTOMER'],
    },
  });
}

describe('POST /api/auth (PH3 Account and Authentication)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('register', () => {
    it('creates an ACTIVE CUSTOMER user, hashed session, and HttpOnly cookie', async () => {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email: '  New.Customer@Example.com ', password })
        .expect(201);

      expectPublicAuthenticationResponse(response.body);
      expect(response.body.user.email).toBe('new.customer@example.com');
      const rawRefreshToken = expectRefreshCookie(response.headers);

      const user = await t.prisma.user.findUnique({
        where: { email: 'new.customer@example.com' },
        include: { userRoles: { include: { role: true } }, refreshTokens: true },
      });
      expect(user).not.toBeNull();
      expect(user).toMatchObject({ status: UserStatus.ACTIVE });
      expect(user?.passwordHash).not.toBe(password);
      expect(user?.userRoles.map(({ role }) => role.code)).toEqual(['CUSTOMER']);
      expect(user?.refreshTokens).toHaveLength(1);
      expect(user?.refreshTokens[0]?.tokenHash).toBe(
        createHash('sha256').update(rawRefreshToken).digest('hex'),
      );
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
    });

    it('normalizes email and rejects a case-insensitive duplicate with 409', async () => {
      await t.http
        .post('/api/auth/register')
        .send({ email: 'duplicate@example.com', password })
        .expect(201);

      const response = await t.http
        .post('/api/auth/register')
        .send({ email: 'DUPLICATE@EXAMPLE.COM', password })
        .expect(409);

      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email da duoc su dung',
      });
      expect(response.body).not.toHaveProperty('user');
    });

    it('rejects a weak password through the shared validation format', async () => {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email: 'weak@example.com', password: 'weakpass' })
        .expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
      expect(Array.isArray(response.body.message)).toBe(true);
    });
  });

  describe('login', () => {
    async function registerActiveUser(email = 'login@example.com'): Promise<void> {
      await t.http.post('/api/auth/register').send({ email, password }).expect(201);
    }

    it('returns an access token, public user, and a new refresh session', async () => {
      await registerActiveUser();

      const response = await t.http
        .post('/api/auth/login')
        .send({ email: 'LOGIN@EXAMPLE.COM', password })
        .expect(200);

      expectPublicAuthenticationResponse(response.body);
      expectRefreshCookie(response.headers);
      const user = await t.prisma.user.findUnique({
        where: { email: 'login@example.com' },
        include: { refreshTokens: true },
      });
      expect(user?.refreshTokens).toHaveLength(2);
    });

    it('returns the same public authentication failure for unknown email and wrong password', async () => {
      await registerActiveUser();

      const wrongPassword = await t.http
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'WrongPassword123' })
        .expect(401);
      const nonexistent = await t.http
        .post('/api/auth/login')
        .send({ email: 'missing@example.com', password: 'WrongPassword123' })
        .expect(401);

      for (const response of [wrongPassword, nonexistent]) {
        expect(response.body).toMatchObject({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoac mat khau khong dung',
        });
        expect(Object.keys(response.body).sort()).toEqual([
          'code',
          'message',
          'path',
          'statusCode',
          'timestamp',
        ]);
      }
    });

    it.each([UserStatus.LOCKED, UserStatus.DISABLED])(
      'does not issue tokens for a %s user',
      async (status) => {
        const hasher = t.app.get(PasswordHasherService);
        await t.prisma.user.create({
          data: {
            email: `${status.toLowerCase()}@example.com`,
            passwordHash: await hasher.hash(password),
            status,
          },
        });

        const response = await t.http
          .post('/api/auth/login')
          .send({ email: `${status.toLowerCase()}@example.com`, password })
          .expect(401);

        expect(response.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          message: 'Email hoac mat khau khong dung',
        });
        expect(response.headers['set-cookie']).toBeUndefined();
      },
    );
  });
});
