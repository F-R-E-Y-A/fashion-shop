import { createHash, randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UserStatus } from '../src/generated/prisma/client.js';
import { PasswordHasherService } from '../src/modules/auth/password-hasher.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
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

function expectRefreshCookieCleared(headers: Record<string, unknown>): void {
  const cookies = headers['set-cookie'];
  expect(Array.isArray(cookies)).toBe(true);
  const refreshCookie = (cookies as string[]).find((cookie) => cookie.startsWith('refresh_token='));
  expect(refreshCookie).toContain('HttpOnly');
  expect(refreshCookie).toContain('SameSite=Lax');
  expect(refreshCookie).toContain('Path=/api/auth');
  expect(refreshCookie).toContain('Expires=Thu, 01 Jan 1970');
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

function expectUnauthorized(response: { body: unknown }): void {
  expect(response.body).toMatchObject({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message: 'Khong duoc phep truy cap',
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

  describe('GET /auth/me', () => {
    async function registerActiveUser(email = 'me@example.com'): Promise<{
      accessToken: string;
      id: string;
    }> {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);
      return { accessToken: response.body.accessToken, id: response.body.user.id };
    }

    it('returns only the safe current-user contract for a valid access token', async () => {
      const user = await registerActiveUser();

      const response = await t.http
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: user.id,
        email: 'me@example.com',
        roles: ['CUSTOMER'],
      });
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
      expect(JSON.stringify(response.body)).not.toContain('refresh');
    });

    it.each([undefined, 'Basic not-a-bearer-token', 'Bearer'])(
      'rejects a missing or malformed Authorization header',
      async (authorization) => {
        const request = t.http.get('/api/auth/me');
        if (authorization) request.set('Authorization', authorization);

        expectUnauthorized(await request.expect(401));
      },
    );

    it('rejects an invalid access token', async () => {
      expectUnauthorized(
        await t.http.get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401),
      );
    });

    it('rejects an expired access token', async () => {
      const user = await registerActiveUser();
      const jwt = t.app.get(JwtService);
      const expiredToken = await jwt.signAsync({ sub: user.id }, { expiresIn: -1 });

      expectUnauthorized(
        await t.http.get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`).expect(401),
      );
    });

    it('rejects a validly signed token for a user that no longer exists', async () => {
      const tokens = t.app.get(TokenService);
      const accessToken = await tokens.signAccessToken(randomUUID());

      expectUnauthorized(
        await t.http.get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401),
      );
    });

    it.each([UserStatus.LOCKED, UserStatus.DISABLED])(
      'rejects an existing access token after the account becomes %s',
      async (status) => {
        const user = await registerActiveUser(`${status.toLowerCase()}-me@example.com`);
        await t.prisma.user.update({ where: { id: user.id }, data: { status } });

        expectUnauthorized(
          await t.http
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${user.accessToken}`)
            .expect(401),
        );
      },
    );
  });

  describe('POST /auth/refresh', () => {
    async function registerSession(email = 'refresh@example.com'): Promise<{
      id: string;
      refreshToken: string;
    }> {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);
      return { id: response.body.user.id, refreshToken: expectRefreshCookie(response.headers) };
    }

    it('rotates a valid refresh token and persists only its hash', async () => {
      const session = await registerSession();
      const oldTokenHash = createHash('sha256').update(session.refreshToken).digest('hex');

      const response = await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(200);

      expectPublicAuthenticationResponse(response.body);
      expect(JSON.stringify(response.body)).not.toContain(session.refreshToken);
      expect(JSON.stringify(response.body)).not.toContain('tokenHash');
      const replacementRawToken = expectRefreshCookie(response.headers);
      expect(replacementRawToken).not.toBe(session.refreshToken);

      const [oldToken, replacement] = await Promise.all([
        t.prisma.refreshToken.findUnique({ where: { tokenHash: oldTokenHash } }),
        t.prisma.refreshToken.findUnique({
          where: {
            tokenHash: createHash('sha256').update(replacementRawToken).digest('hex'),
          },
        }),
      ]);
      expect(oldToken?.revokedAt).not.toBeNull();
      expect(oldToken?.replacedByTokenId).toBe(replacement?.id);
      expect(replacement).toMatchObject({ userId: session.id, familyId: oldToken?.familyId });
      expect(replacement?.tokenHash).not.toBe(replacementRawToken);
    });

    it('rejects a rotated token and accepts its replacement', async () => {
      const session = await registerSession();
      const firstRefresh = await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(200);
      const replacement = expectRefreshCookie(firstRefresh.headers);

      const replay = await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(401);
      expectUnauthorized(replay);
      expect(replay.headers['set-cookie']).toBeUndefined();

      const secondRefresh = await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${replacement}`)
        .expect(200);
      expectPublicAuthenticationResponse(secondRefresh.body);
      expectRefreshCookie(secondRefresh.headers);
    });

    it('rejects an expired refresh token without creating a replacement', async () => {
      const session = await registerSession();
      const tokenHash = createHash('sha256').update(session.refreshToken).digest('hex');
      await t.prisma.refreshToken.update({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const response = await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(401);
      expectUnauthorized(response);
      expect(await t.prisma.refreshToken.count({ where: { userId: session.id } })).toBe(1);
    });

    it.each([undefined, 'unknown-refresh-token'])(
      'rejects a missing or unknown refresh cookie',
      async (refreshToken) => {
        const request = t.http.post('/api/auth/refresh');
        if (refreshToken) request.set('Cookie', `refresh_token=${refreshToken}`);

        expectUnauthorized(await request.expect(401));
      },
    );

    it.each([UserStatus.LOCKED, UserStatus.DISABLED])(
      'rejects refresh without rotation when the account is %s',
      async (status) => {
        const session = await registerSession(`${status.toLowerCase()}-refresh@example.com`);
        await t.prisma.user.update({ where: { id: session.id }, data: { status } });

        const response = await t.http
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${session.refreshToken}`)
          .expect(401);
        expectUnauthorized(response);
        expect(await t.prisma.refreshToken.count({ where: { userId: session.id } })).toBe(1);
      },
    );
  });

  describe('POST /auth/logout', () => {
    async function registerSession(email = 'logout@example.com'): Promise<{
      id: string;
      refreshToken: string;
    }> {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email, password })
        .expect(201);
      return { id: response.body.user.id, refreshToken: expectRefreshCookie(response.headers) };
    }

    it('revokes the presented token, clears its cookie, and prevents refresh', async () => {
      const session = await registerSession();
      const response = await t.http
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(204);

      expect(response.text).toBe('');
      expectRefreshCookieCleared(response.headers);
      const token = await t.prisma.refreshToken.findUnique({
        where: { tokenHash: createHash('sha256').update(session.refreshToken).digest('hex') },
      });
      expect(token?.revokedAt).not.toBeNull();

      expectUnauthorized(
        await t.http
          .post('/api/auth/refresh')
          .set('Cookie', `refresh_token=${session.refreshToken}`)
          .expect(401),
      );
    });

    it.each([undefined, 'unknown-refresh-token'])(
      'is idempotent for a missing or unknown refresh cookie',
      async (refreshToken) => {
        const request = t.http.post('/api/auth/logout');
        if (refreshToken) request.set('Cookie', `refresh_token=${refreshToken}`);

        const response = await request.expect(204);
        expectRefreshCookieCleared(response.headers);
      },
    );

    it('is idempotent for an already revoked refresh token', async () => {
      const session = await registerSession();
      await t.http
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(204);

      const response = await t.http
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(204);
      expectRefreshCookieCleared(response.headers);
    });
  });
});
