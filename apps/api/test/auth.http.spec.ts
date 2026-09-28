import { createHash, randomUUID } from 'node:crypto';

import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OtpPurpose, UserStatus } from '../src/generated/prisma/client.js';
import { hashOtpCode } from '../src/modules/auth/otp.util.js';
import { PasswordHasherService } from '../src/modules/auth/password-hasher.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const password = 'Password123';
const newPassword = 'NewPassword123';

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

describe('POST /api/auth (PH3 + PH3.1 Account, Authentication, Email Verification)', () => {
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

  /** Registers (PENDING_VERIFICATION, no session) and returns the OTP that was "emailed". */
  async function registerPending(email: string): Promise<string> {
    await t.http.post('/api/auth/register').send({ email, password }).expect(201);
    const code = t.mail.lastCodeSentTo(email.trim().toLowerCase());
    if (!code) throw new Error(`No verification email captured for ${email}`);
    return code;
  }

  /** Full happy path: register, verify with the real emailed OTP, then log in. */
  async function activateAndLogin(
    email: string,
  ): Promise<{ id: string; accessToken: string; refreshToken: string }> {
    const code = await registerPending(email);
    await t.http.post('/api/auth/verify-email').send({ email, code }).expect(200);

    const response = await t.http.post('/api/auth/login').send({ email, password }).expect(200);
    return {
      id: response.body.user.id,
      accessToken: response.body.accessToken,
      refreshToken: expectRefreshCookie(response.headers),
    };
  }

  describe('register', () => {
    it('creates a PENDING_VERIFICATION CUSTOMER user, emails an OTP, and issues no session', async () => {
      const response = await t.http
        .post('/api/auth/register')
        .send({ email: '  New.Customer@Example.com ', password })
        .expect(201);

      expect(response.body).toEqual({
        verificationRequired: true,
        email: 'new.customer@example.com',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('password');

      const user = await t.prisma.user.findUnique({
        where: { email: 'new.customer@example.com' },
        include: { userRoles: { include: { role: true } }, refreshTokens: true },
      });
      expect(user).toMatchObject({ status: UserStatus.PENDING_VERIFICATION });
      expect(user?.passwordHash).not.toBe(password);
      expect(user?.userRoles.map(({ role }) => role.code)).toEqual(['CUSTOMER']);
      expect(user?.refreshTokens).toHaveLength(0);

      const otp = await t.prisma.otpCode.findFirst({
        where: { email: 'new.customer@example.com', purpose: OtpPurpose.EMAIL_VERIFICATION },
      });
      expect(otp).toMatchObject({ consumedAt: null, attemptCount: 0, sendCount: 1 });
      expect(otp?.codeHash).not.toMatch(/^\d{6}$/);

      const sent = t.mail.sent.find((message) => message.to === 'new.customer@example.com');
      expect(sent?.text).toMatch(/\b\d{6}\b/);
      expect(JSON.stringify(sent)).not.toContain(password);
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
      expect(response.body).not.toHaveProperty('email');
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

  describe('verify-email', () => {
    it('activates the account and consumes the OTP on a correct code', async () => {
      const email = 'verify-ok@example.com';
      const code = await registerPending(email);

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code })
        .expect(200);
      expect(response.body).toEqual({ verified: true });
      expect(response.headers['set-cookie']).toBeUndefined();

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.status).toBe(UserStatus.ACTIVE);
      const otp = await t.prisma.otpCode.findFirst({ where: { email } });
      expect(otp?.consumedAt).not.toBeNull();
    });

    it('increments attemptCount on an incorrect code without activating the account', async () => {
      const email = 'verify-wrong@example.com';
      await registerPending(email);

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code: '000000' })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_INVALID' });

      const otp = await t.prisma.otpCode.findFirst({ where: { email } });
      expect(otp?.attemptCount).toBe(1);
      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.status).toBe(UserStatus.PENDING_VERIFICATION);
    });

    it('rejects once max attempts are exceeded, even with the correct code', async () => {
      const email = 'verify-exceeded@example.com';
      const code = await registerPending(email);

      for (let i = 0; i < 5; i++) {
        const response = await t.http
          .post('/api/auth/verify-email')
          .send({ email, code: '000000' })
          .expect(400);
        expect(response.body).toMatchObject({ code: 'OTP_INVALID' });
      }

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_ATTEMPTS_EXCEEDED' });

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.status).toBe(UserStatus.PENDING_VERIFICATION);
    });

    it('rejects an expired code without activating the account', async () => {
      const email = 'verify-expired@example.com';
      const code = await registerPending(email);
      await t.prisma.otpCode.updateMany({
        where: { email },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_EXPIRED' });
    });

    it('rejects a code that has already been consumed', async () => {
      const email = 'verify-replay@example.com';
      const code = await registerPending(email);
      await t.http.post('/api/auth/verify-email').send({ email, code }).expect(200);

      const replay = await t.http.post('/api/auth/verify-email').send({ email, code }).expect(400);
      expect(replay.body).toMatchObject({ code: 'OTP_INVALID' });
    });

    it('rejects a code issued for a different email', async () => {
      const codeForA = await registerPending('owner-a@example.com');
      await registerPending('owner-b@example.com');

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email: 'owner-b@example.com', code: codeForA })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_INVALID' });
    });

    it('rejects a code issued for a different purpose', async () => {
      const email = 'verify-purpose@example.com';
      await registerPending(email);
      const foreignCode = '999999';
      await t.prisma.otpCode.create({
        data: {
          email,
          purpose: OtpPurpose.PASSWORD_RESET,
          codeHash: hashOtpCode(
            process.env.OTP_PEPPER!,
            email,
            OtpPurpose.PASSWORD_RESET,
            foreignCode,
          ),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code: foreignCode })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_INVALID' });
    });

    it('does not issue an access token, refresh token, or cookie on success', async () => {
      const email = 'verify-no-session@example.com';
      const code = await registerPending(email);

      const response = await t.http
        .post('/api/auth/verify-email')
        .send({ email, code })
        .expect(200);
      expect(JSON.stringify(response.body)).not.toContain('accessToken');
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('verify-email concurrency (fix for the transaction-rollback bug)', () => {
    it('lets only one of two concurrent requests with the same correct code succeed', async () => {
      const email = 'concurrent-correct@example.com';
      const code = await registerPending(email);

      const [first, second] = await Promise.all([
        t.http.post('/api/auth/verify-email').send({ email, code }),
        t.http.post('/api/auth/verify-email').send({ email, code }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 400]);
      const winner = first.status === 200 ? first : second;
      const loser = first.status === 200 ? second : first;
      expect(winner.body).toEqual({ verified: true });
      expect(loser.body).toMatchObject({ code: 'OTP_INVALID' });

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.status).toBe(UserStatus.ACTIVE);
      const otp = await t.prisma.otpCode.findFirst({ where: { email } });
      expect(otp?.consumedAt).not.toBeNull();
    });

    it('accumulates attemptCount correctly across concurrent wrong-code submissions, with no lost update', async () => {
      const email = 'concurrent-wrong@example.com';
      await registerPending(email);

      const responses = await Promise.all([
        t.http.post('/api/auth/verify-email').send({ email, code: '111111' }),
        t.http.post('/api/auth/verify-email').send({ email, code: '222222' }),
      ]);
      expect(responses.every((response) => response.status === 400)).toBe(true);

      const otp = await t.prisma.otpCode.findFirst({ where: { email } });
      expect(otp?.attemptCount).toBe(2);
    });

    it('never leaves the old code usable once a concurrent resend has completed', async () => {
      const email = 'concurrent-resend@example.com';
      const oldCode = await registerPending(email);
      await t.prisma.otpCode.updateMany({
        where: { email },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      await Promise.all([
        t.http.post('/api/auth/verify-email').send({ email, code: oldCode }),
        t.http.post('/api/auth/resend-verification').send({ email }),
      ]);

      const replay = await t.http.post('/api/auth/verify-email').send({ email, code: oldCode });
      expect(replay.status).toBe(400);
      expect(replay.body).toMatchObject({ code: 'OTP_INVALID' });
    });
  });

  describe('resend-verification', () => {
    it('issues a new OTP for a pending account and invalidates the old one', async () => {
      const email = 'resend-ok@example.com';
      const oldCode = await registerPending(email);
      await t.prisma.otpCode.updateMany({
        where: { email },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      const response = await t.http
        .post('/api/auth/resend-verification')
        .send({ email })
        .expect(200);
      expect(response.body).toEqual({ accepted: true });

      const newCode = t.mail.lastCodeSentTo(email);
      expect(newCode).toBeDefined();
      expect(newCode).not.toBe(oldCode);

      await t.http.post('/api/auth/verify-email').send({ email, code: oldCode }).expect(400);
      await t.http.post('/api/auth/verify-email').send({ email, code: newCode }).expect(200);
    });

    it('enforces the 60-second resend cooldown by silently skipping issuance', async () => {
      const email = 'resend-cooldown@example.com';
      await registerPending(email);
      const sentBefore = t.mail.sent.length;

      const response = await t.http
        .post('/api/auth/resend-verification')
        .send({ email })
        .expect(200);
      expect(response.body).toEqual({ accepted: true });
      expect(t.mail.sent.length).toBe(sentBefore);
    });

    it('returns the generic response for an unknown email without creating an OTP', async () => {
      const email = 'never-registered@example.com';

      const response = await t.http
        .post('/api/auth/resend-verification')
        .send({ email })
        .expect(200);
      expect(response.body).toEqual({ accepted: true });

      const otp = await t.prisma.otpCode.findFirst({ where: { email } });
      expect(otp).toBeNull();
      expect(t.mail.sent.some((message) => message.to === email)).toBe(false);
    });

    it('returns the generic response for an already-ACTIVE account without sending a new email', async () => {
      const email = 'resend-active@example.com';
      await activateAndLogin(email);
      const sentBefore = t.mail.sent.length;

      const response = await t.http
        .post('/api/auth/resend-verification')
        .send({ email })
        .expect(200);
      expect(response.body).toEqual({ accepted: true });
      expect(t.mail.sent.length).toBe(sentBefore);
    });
  });

  /** Requests a reset OTP for an ACTIVE account and returns the code that was "emailed". */
  async function requestPasswordReset(email: string): Promise<string> {
    await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
    const code = t.mail.lastCodeSentTo(email);
    if (!code) throw new Error(`No password-reset email captured for ${email}`);
    return code;
  }

  describe('forgot-password', () => {
    it('issues a PASSWORD_RESET OTP and emails it for an ACTIVE account', async () => {
      const email = 'forgot-active@example.com';
      await activateAndLogin(email);

      const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      expect(response.body).toEqual({ accepted: true });

      const otp = await t.prisma.otpCode.findFirst({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
      });
      expect(otp).toMatchObject({ consumedAt: null, attemptCount: 0 });
      expect(otp?.codeHash).not.toMatch(/^\d{6}$/);
      const sent = t.mail.sent.find(
        (message) => message.to === email && /dat lai mat khau/i.test(message.subject),
      );
      expect(sent?.text).toMatch(/\b\d{6}\b/);
    });

    it('does not create an EMAIL_VERIFICATION OTP as a side effect', async () => {
      const email = 'forgot-no-cross-purpose@example.com';
      await activateAndLogin(email);

      await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);

      const emailVerificationOtp = await t.prisma.otpCode.findFirst({
        where: { email, purpose: OtpPurpose.EMAIL_VERIFICATION, consumedAt: null },
      });
      expect(emailVerificationOtp).toBeNull();
    });

    it('returns the generic response for an unknown email without creating an OTP', async () => {
      const email = 'forgot-unknown@example.com';

      const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      expect(response.body).toEqual({ accepted: true });
      expect(await t.prisma.otpCode.findFirst({ where: { email } })).toBeNull();
      expect(t.mail.sent.some((message) => message.to === email)).toBe(false);
    });

    it('returns the generic response for a PENDING_VERIFICATION account without creating a PASSWORD_RESET OTP', async () => {
      const email = 'forgot-pending@example.com';
      await registerPending(email);
      const sentBefore = t.mail.sent.length;

      const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      expect(response.body).toEqual({ accepted: true });
      expect(
        await t.prisma.otpCode.findFirst({ where: { email, purpose: OtpPurpose.PASSWORD_RESET } }),
      ).toBeNull();
      expect(t.mail.sent.length).toBe(sentBefore);
    });

    it.each([UserStatus.LOCKED, UserStatus.DISABLED])(
      'returns the generic response for a %s account without creating a PASSWORD_RESET OTP',
      async (status) => {
        const email = `forgot-${status.toLowerCase()}@example.com`;
        await activateAndLogin(email);
        await t.prisma.user.update({ where: { email }, data: { status } });
        const sentBefore = t.mail.sent.length;

        const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
        expect(response.body).toEqual({ accepted: true });
        expect(
          await t.prisma.otpCode.findFirst({
            where: { email, purpose: OtpPurpose.PASSWORD_RESET },
          }),
        ).toBeNull();
        expect(t.mail.sent.length).toBe(sentBefore);
      },
    );

    it('enforces the 60-second resend cooldown by silently skipping issuance', async () => {
      const email = 'forgot-cooldown@example.com';
      await activateAndLogin(email);
      await requestPasswordReset(email);
      const sentBefore = t.mail.sent.length;

      const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      expect(response.body).toEqual({ accepted: true });
      expect(t.mail.sent.length).toBe(sentBefore);
    });
  });

  describe('reset-password', () => {
    it('changes the password on a correct OTP: old password fails, new password logs in', async () => {
      const email = 'reset-ok@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword })
        .expect(200);
      expect(response.body).toEqual({ reset: true });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('accessToken');

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.passwordHash).not.toBe(newPassword);
      expect(user?.passwordHash).not.toBe(password);

      await t.http.post('/api/auth/login').send({ email, password }).expect(401);
      await t.http.post('/api/auth/login').send({ email, password: newPassword }).expect(200);
    });

    it('consumes the OTP so the same code cannot reset the password twice', async () => {
      const email = 'reset-replay@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      await t.http.post('/api/auth/reset-password').send({ email, code, newPassword }).expect(200);
      const replay = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword: 'AnotherPassword123' })
        .expect(400);
      expect(replay.body).toMatchObject({ code: 'OTP_INVALID' });
    });

    it('increments attemptCount on an incorrect code without changing the password', async () => {
      const email = 'reset-wrong@example.com';
      await activateAndLogin(email);
      await requestPasswordReset(email);

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code: '000000', newPassword })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_INVALID' });

      const otp = await t.prisma.otpCode.findFirst({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
      });
      expect(otp?.attemptCount).toBe(1);
      await t.http.post('/api/auth/login').send({ email, password }).expect(200);
    });

    it('rejects once max attempts are exceeded, even with the correct code', async () => {
      const email = 'reset-exceeded@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      for (let i = 0; i < 5; i++) {
        await t.http
          .post('/api/auth/reset-password')
          .send({ email, code: '000000', newPassword })
          .expect(400);
      }

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_ATTEMPTS_EXCEEDED' });
      await t.http.post('/api/auth/login').send({ email, password }).expect(200);
    });

    it('rejects an expired code', async () => {
      const email = 'reset-expired@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);
      await t.prisma.otpCode.updateMany({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_EXPIRED' });
    });

    it('rejects an EMAIL_VERIFICATION OTP even when its code value matches', async () => {
      const email = 'reset-wrong-purpose@example.com';
      await activateAndLogin(email);
      await requestPasswordReset(email); // creates a real PASSWORD_RESET OTP with an unrelated code
      const foreignCode = '999999';
      await t.prisma.otpCode.create({
        data: {
          email,
          purpose: OtpPurpose.EMAIL_VERIFICATION,
          codeHash: hashOtpCode(
            process.env.OTP_PEPPER!,
            email,
            OtpPurpose.EMAIL_VERIFICATION,
            foreignCode,
          ),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code: foreignCode, newPassword })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'OTP_INVALID' });
      await t.http.post('/api/auth/login').send({ email, password }).expect(200);
    });

    it('rejects a weak new password without consuming the OTP', async () => {
      const email = 'reset-weak-password@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword: 'weakpass' })
        .expect(400);
      expect(response.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });

      // The OTP must still work afterward: DTO validation failed before touching OtpService.
      await t.http.post('/api/auth/reset-password').send({ email, code, newPassword }).expect(200);
    });
  });

  describe('reset-password session revocation', () => {
    it('revokes every refresh session across every family, not just the current one', async () => {
      const email = 'reset-revoke-all@example.com';
      const session1 = await activateAndLogin(email);
      const login2 = await t.http.post('/api/auth/login').send({ email, password }).expect(200);
      const session2Token = expectRefreshCookie(login2.headers);

      const activeBefore = await t.prisma.refreshToken.count({
        where: { userId: session1.id, revokedAt: null },
      });
      expect(activeBefore).toBe(2);

      const code = await requestPasswordReset(email);
      await t.http.post('/api/auth/reset-password').send({ email, code, newPassword }).expect(200);

      const activeAfter = await t.prisma.refreshToken.count({
        where: { userId: session1.id, revokedAt: null },
      });
      expect(activeAfter).toBe(0);

      await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session1.refreshToken}`)
        .expect(401);
      await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${session2Token}`)
        .expect(401);
    });
  });

  describe('reset-password / forgot-password concurrency', () => {
    it('lets only one of two concurrent resets with the same correct OTP succeed', async () => {
      const email = 'concurrent-reset-correct@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const [first, second] = await Promise.all([
        t.http.post('/api/auth/reset-password').send({ email, code, newPassword }),
        t.http.post('/api/auth/reset-password').send({ email, code, newPassword }),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 400]);
      await t.http.post('/api/auth/login').send({ email, password: newPassword }).expect(200);
    });

    it('accumulates attemptCount correctly across concurrent wrong-code submissions', async () => {
      const email = 'concurrent-reset-wrong@example.com';
      await activateAndLogin(email);
      await requestPasswordReset(email);

      const responses = await Promise.all([
        t.http.post('/api/auth/reset-password').send({ email, code: '111111', newPassword }),
        t.http.post('/api/auth/reset-password').send({ email, code: '222222', newPassword }),
      ]);
      expect(responses.every((response) => response.status === 400)).toBe(true);

      const otp = await t.prisma.otpCode.findFirst({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
      });
      expect(otp?.attemptCount).toBe(2);
    });

    it('never leaves the old OTP usable once a concurrent forgot-password (resend) has completed', async () => {
      const email = 'concurrent-reset-resend@example.com';
      await activateAndLogin(email);
      const oldCode = await requestPasswordReset(email);
      await t.prisma.otpCode.updateMany({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      await Promise.all([
        t.http.post('/api/auth/reset-password').send({ email, code: oldCode, newPassword }),
        t.http.post('/api/auth/forgot-password').send({ email }),
      ]);

      const replay = await t.http
        .post('/api/auth/reset-password')
        .send({ email, code: oldCode, newPassword: 'YetAnotherPassword123' });
      expect(replay.status).toBe(400);
      expect(replay.body).toMatchObject({ code: 'OTP_INVALID' });
    });
  });

  describe('login', () => {
    it('returns an access token, public user, and a new refresh session', async () => {
      const email = 'login@example.com';
      const code = await registerPending(email);
      await t.http.post('/api/auth/verify-email').send({ email, code }).expect(200);

      const response = await t.http
        .post('/api/auth/login')
        .send({ email: 'LOGIN@EXAMPLE.COM', password })
        .expect(200);

      expectPublicAuthenticationResponse(response.body);
      expectRefreshCookie(response.headers);
      const user = await t.prisma.user.findUnique({
        where: { email },
        include: { refreshTokens: true },
      });
      expect(user?.refreshTokens).toHaveLength(1);
    });

    it('returns the same public authentication failure for unknown email and wrong password', async () => {
      const email = 'login-fail@example.com';
      const code = await registerPending(email);
      await t.http.post('/api/auth/verify-email').send({ email, code }).expect(200);

      const wrongPassword = await t.http
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword123' })
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

    it('rejects a correct password for a PENDING_VERIFICATION account with EMAIL_NOT_VERIFIED', async () => {
      const email = 'pending-correct-password@example.com';
      await registerPending(email);

      const response = await t.http.post('/api/auth/login').send({ email, password }).expect(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'EMAIL_NOT_VERIFIED',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a wrong password for a PENDING_VERIFICATION account with generic INVALID_CREDENTIALS', async () => {
      const email = 'pending-wrong-password@example.com';
      await registerPending(email);

      const response = await t.http
        .post('/api/auth/login')
        .send({ email, password: 'WrongPassword123' })
        .expect(401);
      expect(response.body).toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });
  });

  describe('GET /auth/me', () => {
    it('returns only the safe current-user contract for a valid access token', async () => {
      const email = 'me@example.com';
      const session = await activateAndLogin(email);

      const response = await t.http
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: session.id,
        email,
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
      const session = await activateAndLogin('me-expired@example.com');
      const jwt = t.app.get(JwtService);
      const expiredToken = await jwt.signAsync({ sub: session.id }, { expiresIn: -1 });

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
        const session = await activateAndLogin(`${status.toLowerCase()}-me@example.com`);
        await t.prisma.user.update({ where: { id: session.id }, data: { status } });

        expectUnauthorized(
          await t.http
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${session.accessToken}`)
            .expect(401),
        );
      },
    );
  });

  describe('POST /auth/refresh', () => {
    it('rotates a valid refresh token and persists only its hash', async () => {
      const session = await activateAndLogin('refresh@example.com');
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
      const session = await activateAndLogin('refresh-replay@example.com');
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
      const session = await activateAndLogin('refresh-expired@example.com');
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
        const session = await activateAndLogin(`${status.toLowerCase()}-refresh@example.com`);
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
    it('revokes the presented token, clears its cookie, and prevents refresh', async () => {
      const session = await activateAndLogin('logout@example.com');
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
      const session = await activateAndLogin('logout-idempotent@example.com');
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
