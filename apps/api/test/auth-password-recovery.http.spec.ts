import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OtpPurpose, UserStatus } from '../src/generated/prisma/client.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const password = 'Password123';
const newPassword = 'NewPassword123';

function expectRefreshCookie(headers: Record<string, unknown>): string {
  const cookies = headers['set-cookie'];
  expect(Array.isArray(cookies)).toBe(true);
  const refreshCookie = (cookies as string[]).find((cookie) => cookie.startsWith('refresh_token='));
  expect(refreshCookie).toContain('HttpOnly');
  expect(refreshCookie).toContain('SameSite=Lax');
  expect(refreshCookie).toContain('Path=/api/auth');
  const match = refreshCookie?.slice('refresh_token='.length).split(';', 1)[0] ?? '';
  return match;
}

describe('Three-Step Password Recovery HTTP & Concurrency Regressions', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    const authService = t.app.get(AuthService);
    authService.resetGateHook = undefined;
    authService.verifyGateHook = undefined;
    authService.changePasswordGateHook = undefined;
  });

  afterAll(async () => {
    await t.close();
  });

  async function registerPending(email: string): Promise<string> {
    await t.http.post('/api/auth/register').send({ email, password }).expect(201);
    const code = t.mail.lastCodeSentTo(email.trim().toLowerCase());
    if (!code) throw new Error(`No verification email captured for ${email}`);
    return code;
  }

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

  async function requestPasswordReset(email: string): Promise<string> {
    await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
    const code = t.mail.lastCodeSentTo(email);
    if (!code) throw new Error(`No password-reset email captured for ${email}`);
    return code;
  }

  describe('3-step password recovery flow', () => {
    it('executes Step 1 (email), Step 2 (verify OTP -> grant), Step 3 (reset password) end-to-end', async () => {
      const email = 'flow-success@example.com';
      const initialSession = await activateAndLogin(email);

      // Step 1: Request reset OTP
      const forgotRes = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      expect(forgotRes.body).toEqual({ accepted: true });
      const code = t.mail.lastCodeSentTo(email);
      expect(code).toMatch(/^\d{6}$/);

      // Step 2: Verify OTP -> returns opaque resetToken
      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);

      expect(verifyRes.body).toHaveProperty('resetToken');
      const resetToken = verifyRes.body.resetToken;
      expect(typeof resetToken).toBe('string');
      expect(resetToken.length).toBe(64); // 32 bytes hex

      // Check DB: OTP consumed, grant created with hash
      const otp = await t.prisma.otpCode.findFirst({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
      });
      expect(otp?.consumedAt).not.toBeNull();

      const grants = await t.prisma.passwordResetGrant.findMany({
        where: { userId: initialSession.id },
      });
      expect(grants).toHaveLength(1);
      expect(grants[0]?.consumedAt).toBeNull();
      expect(grants[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);

      // Step 3: Reset password with resetToken
      const resetRes = await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword })
        .expect(200);
      expect(resetRes.body).toEqual({ reset: true });
      expect(resetRes.headers['set-cookie']).toBeUndefined();

      // Check DB: grant consumed, authVersion incremented
      const updatedGrant = await t.prisma.passwordResetGrant.findUnique({
        where: { id: grants[0]?.id },
      });
      expect(updatedGrant?.consumedAt).not.toBeNull();

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.authVersion).toBe(1);

      // Check notification email was sent
      const notification = t.mail.sent.find(
        (m) => m.to === email && m.subject.includes('Mat khau tai khoan cua ban da duoc thay doi'),
      );
      expect(notification).toBeDefined();

      // Old password fails, new password succeeds
      await t.http.post('/api/auth/login').send({ email, password }).expect(401);
      await t.http.post('/api/auth/login').send({ email, password: newPassword }).expect(200);

      // Old session was revoked
      await t.http
        .post('/api/auth/refresh')
        .set('Cookie', `refresh_token=${initialSession.refreshToken}`)
        .expect(401);
    });

    it('rejects grant replay (grant can only be consumed once)', async () => {
      const email = 'replay-grant@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      await t.http.post('/api/auth/reset-password').send({ resetToken, newPassword }).expect(200);

      // Replay should fail with 400
      const replay = await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: 'AnotherPassword123' })
        .expect(400);

      expect(replay.body).toMatchObject({ code: 'RESET_GRANT_EXHAUSTED' });
    });

    it('rejects an expired resetToken', async () => {
      const email = 'expired-grant@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      // Expire the grant in DB
      await t.prisma.passwordResetGrant.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'RESET_GRANT_EXPIRED' });
    });

    it('rejects an invalid / unknown resetToken', async () => {
      const response = await t.http
        .post('/api/auth/reset-password')
        .send({
          resetToken: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          newPassword,
        })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'RESET_GRANT_INVALID' });
    });

    it('rejects reset if user is LOCKED or DISABLED', async () => {
      const email = 'locked-user@example.com';
      const user = await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      // Admin locks user
      await t.prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.LOCKED },
      });

      const response = await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword })
        .expect(400);

      expect(response.body).toMatchObject({ code: 'RESET_GRANT_INVALID' });
    });
  });

  describe('Concurrency & Race Regressions', () => {
    it('Regression 1: Competitor wins (changePassword commits before reset lock) -> 400 RESET_GRANT_STALE', async () => {
      const email = 'reg1@example.com';
      const user = await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      const authService = t.app.get(AuthService);

      let releaseReset: () => void;
      const resetPaused = new Promise<void>((resolve) => {
        releaseReset = resolve;
      });

      let resetReachedGate: () => void;
      const resetWaiting = new Promise<void>((resolve) => {
        resetReachedGate = resolve;
      });

      authService.resetGateHook = async () => {
        resetReachedGate();
        await resetPaused;
      };

      const resetPromise = (async () => {
        return t.http
          .post('/api/auth/reset-password')
          .send({ resetToken, newPassword: 'NewPassword999' });
      })();

      await resetWaiting;

      // Competitor changes password while reset is paused before lock
      await t.http
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ currentPassword: password, newPassword: 'ChangedPassword123' })
        .expect(204);

      // Now release reset request
      releaseReset!();

      const resetRes = await resetPromise;
      expect(resetRes.status).toBe(400);
      expect(resetRes.body).toMatchObject({ code: 'RESET_GRANT_STALE' });

      authService.resetGateHook = undefined;

      // Changed password must be active
      await t.http
        .post('/api/auth/login')
        .send({ email, password: 'ChangedPassword123' })
        .expect(200);
    });

    it('Regression 2: Reset wins (resetPassword commits before changePassword update) -> 400 CURRENT_PASSWORD_INVALID', async () => {
      const email = 'reg2@example.com';
      const user = await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      const authService = t.app.get(AuthService);

      let releaseChange: () => void;
      const changePaused = new Promise<void>((resolve) => {
        releaseChange = resolve;
      });

      let changeReachedGate: () => void;
      const changeWaiting = new Promise<void>((resolve) => {
        changeReachedGate = resolve;
      });

      authService.changePasswordGateHook = async () => {
        changeReachedGate();
        await changePaused;
      };

      const changePromise = (async () => {
        return t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ currentPassword: password, newPassword: 'ChangedPassword123' });
      })();

      await changeWaiting;

      // Reset commits
      await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: 'ResetPassword123' })
        .expect(200);

      releaseChange!();

      const changeRes = await changePromise;
      expect(changeRes.status).toBe(400);
      expect(changeRes.body).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });

      authService.changePasswordGateHook = undefined;

      await t.http
        .post('/api/auth/login')
        .send({ email, password: 'ResetPassword123' })
        .expect(200);
    });

    it('Regression 3: Resend vs Verify OTP race -> 400 OTP_INVALID, grant not issued', async () => {
      const email = 'reg3@example.com';
      await activateAndLogin(email);
      const oldCode = await requestPasswordReset(email);

      // Advance time past 60s cooldown
      await t.prisma.otpCode.updateMany({
        where: { email, purpose: OtpPurpose.PASSWORD_RESET },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });

      const authService = t.app.get(AuthService);

      let releaseVerify: () => void;
      const verifyPaused = new Promise<void>((resolve) => {
        releaseVerify = resolve;
      });

      let verifyReachedGate: () => void;
      const verifyWaiting = new Promise<void>((resolve) => {
        verifyReachedGate = resolve;
      });

      authService.verifyGateHook = async () => {
        verifyReachedGate();
        await verifyPaused;
      };

      const verifyPromise = (async () => {
        return t.http.post('/api/auth/verify-password-reset-otp').send({ email, code: oldCode });
      })();

      await verifyWaiting;

      // Resend issues new code and consumes old code
      await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);
      const newCode = t.mail.lastCodeSentTo(email);
      expect(newCode).toBeDefined();
      expect(newCode).not.toBe(oldCode);

      releaseVerify!();

      const verifyRes = await verifyPromise;
      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body).toMatchObject({ code: 'OTP_INVALID' });

      authService.verifyGateHook = undefined;

      // New code verifies successfully
      const newVerifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code: newCode })
        .expect(200);
      expect(newVerifyRes.body.resetToken).toBeDefined();
    });

    it('Regression 3b: Resend during cooldown does not revoke active grant', async () => {
      const email = 'reg3b@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      // Resend during 60s cooldown (silently accepts, but issues no new code)
      await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);

      // Existing grant remains valid
      await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: 'NewPassword3b' })
        .expect(200);
    });

    it('Regression 4: DTO validation rejects missing proofs and accepts valid ones', async () => {
      // Missing proof
      await t.http
        .post('/api/auth/reset-password')
        .send({ newPassword: 'ValidPassword123' })
        .expect(400)
        .expect((res) => expect(res.body).toMatchObject({ code: 'BAD_REQUEST' }));

      // Missing code
      await t.http
        .post('/api/auth/reset-password')
        .send({ email: 'test@example.com', newPassword: 'ValidPassword123' })
        .expect(400)
        .expect((res) => expect(res.body).toMatchObject({ code: 'BAD_REQUEST' }));

      // Missing email
      await t.http
        .post('/api/auth/reset-password')
        .send({ code: '123456', newPassword: 'ValidPassword123' })
        .expect(400)
        .expect((res) => expect(res.body).toMatchObject({ code: 'BAD_REQUEST' }));

      // Empty resetToken
      await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken: '   ', newPassword: 'ValidPassword123' })
        .expect(400)
        .expect((res) => expect(res.body).toMatchObject({ code: 'BAD_REQUEST' }));

      // Valid legacy branch
      const email = 'legacy-payload@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword: 'LegacyPassword123' })
        .expect(200);

      await t.http
        .post('/api/auth/login')
        .send({ email, password: 'LegacyPassword123' })
        .expect(200);
    });

    it('Regression 5: Email notification timeout (>3s) does not fail HTTP 200', async () => {
      const email = 'reg5@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken;

      const originalSend = t.mail.send.bind(t.mail);
      t.mail.send = async (msg) => {
        if (msg.subject.includes('Mat khau')) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
        return originalSend(msg);
      };

      const start = Date.now();
      const res = await t.http
        .post('/api/auth/reset-password')
        .send({ resetToken, newPassword: 'NewPasswordReg5' })
        .expect(200);
      const duration = Date.now() - start;

      expect(res.body).toEqual({ reset: true });
      expect(duration).toBeGreaterThanOrEqual(2900);
      expect(duration).toBeLessThan(4500);

      await t.http.post('/api/auth/login').send({ email, password: 'NewPasswordReg5' }).expect(200);

      t.mail.send = originalSend;
    }, 10_000);

    it('Regression 6: Expired grant while waiting on user lock returns 400 RESET_GRANT_EXPIRED', async () => {
      const email = 'reg6-lock-expiry@example.com';
      await activateAndLogin(email);
      const code = await requestPasswordReset(email);

      const verifyRes = await t.http
        .post('/api/auth/verify-password-reset-otp')
        .send({ email, code })
        .expect(200);
      const resetToken = verifyRes.body.resetToken as string;

      await t.prisma.passwordResetGrant.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(Date.now() + 700) },
      });

      let markLocked!: () => void;
      const lockAcquired = new Promise<void>((resolve) => {
        markLocked = resolve;
      });
      let releaseLock!: () => void;
      const lockGate = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });

      const lockHolder = t.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT 1 FROM "users" WHERE "email" = ${email} FOR NO KEY UPDATE
        `;
        markLocked();
        await lockGate;
      });

      await lockAcquired;

      const resetPromise = (async () =>
        t.http
          .post('/api/auth/reset-password')
          .send({ resetToken, newPassword: 'ExpiredAfterLock123' }))();

      await new Promise((resolve) => setTimeout(resolve, 900));
      releaseLock();

      const [resetRes] = await Promise.all([resetPromise, lockHolder]);
      expect(resetRes.status).toBe(400);
      expect(resetRes.body).toMatchObject({ code: 'RESET_GRANT_EXPIRED' });

      await t.http.post('/api/auth/login').send({ email, password }).expect(200);
      await t.http
        .post('/api/auth/login')
        .send({ email, password: 'ExpiredAfterLock123' })
        .expect(401);
    }, 10_000);
  });
});
