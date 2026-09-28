import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OtpPurpose, UserStatus } from '../src/generated/prisma/client.js';
import { rateLimitKeyPrefix } from '../src/infra/rate-limit/redis-rate-limiter.js';
import { PasswordHasherService } from '../src/modules/auth/password-hasher.service.js';
import { authFlows, PASSWORD, refreshCookieValue } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const WRONG = 'WrongPassword123';
const NEW_PASSWORD = 'NewPassword456';

describe('PH3.4 security hardening (real Postgres + real Redis)', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;

  beforeAll(async () => {
    t = await createTestApp();
    flows = authFlows(t);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
  });

  afterAll(async () => {
    await t.close();
  });

  /** ACTIVE user inserted directly (no bcrypt-per-user, no email) for tests that need many users. */
  async function insertActiveUser(email: string, passwordHash: string): Promise<string> {
    const user = await t.prisma.user.create({
      data: { email, passwordHash, status: UserStatus.ACTIVE },
    });
    return user.id;
  }

  // ---------------------------------------------------------------------------------------------
  describe('login brute-force protection', () => {
    it('blocks the 6th attempt with 429 + Retry-After, even when the password is correct', async () => {
      const email = 'bf-existing@example.com';
      await flows.activateAndLogin(email);

      for (let i = 0; i < 5; i++) await flows.login(email, WRONG).expect(401);

      flows.expectRateLimited(await flows.login(email, PASSWORD));
    });

    it('treats an unknown email exactly like a real one (no account enumeration)', async () => {
      const real = 'bf-real@example.com';
      const ghost = 'bf-ghost@example.com';
      await flows.activateAndLogin(real);

      const sequence = async (email: string) => {
        const responses = [];
        for (let i = 0; i < 6; i++) responses.push(await flows.login(email, WRONG));
        return responses;
      };
      const realResponses = await sequence(real);
      const ghostResponses = await sequence(ghost);

      expect(realResponses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429]);
      expect(ghostResponses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 429]);
      flows.expectRateLimited(realResponses[5]!);
      flows.expectRateLimited(ghostResponses[5]!);
      expect(ghostResponses[5]!.body.message).toBe(realResponses[5]!.body.message);
      expect(Object.keys(ghostResponses[0]!.body).sort()).toEqual(
        Object.keys(realResponses[0]!.body).sort(),
      );
    });

    it('a successful login resets the identity counter', async () => {
      const email = 'bf-reset@example.com';
      await flows.activateAndLogin(email);

      for (let i = 0; i < 3; i++) await flows.login(email, WRONG).expect(401);
      await flows.login(email).expect(200);

      // Without the reset these four would push the count to 8 and hit 429 on the third.
      for (let i = 0; i < 4; i++) await flows.login(email, WRONG).expect(401);
    });

    it('keeps identities isolated: blocking one email does not affect another', async () => {
      await flows.activateAndLogin('bf-a@example.com');
      await flows.activateAndLogin('bf-b@example.com');
      for (let i = 0; i < 5; i++) await flows.login('bf-a@example.com', WRONG).expect(401);
      flows.expectRateLimited(await flows.login('bf-a@example.com', WRONG));

      await flows.login('bf-b@example.com').expect(200);
    });

    it('never flips the account to LOCKED just because of failed logins', async () => {
      const email = 'bf-no-lock@example.com';
      await flows.activateAndLogin(email);
      for (let i = 0; i < 6; i++) await flows.login(email, WRONG);

      const user = await t.prisma.user.findUnique({ where: { email } });
      expect(user?.status).toBe(UserStatus.ACTIVE);
    });

    it('limits per client IP atomically: 60 parallel attempts -> exactly 50 processed, 10 blocked', async () => {
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          flows.login(`ghost-${i}@example.com`, WRONG, '198.51.100.10'),
        ),
      );

      expect(results.filter((r) => r.status === 401)).toHaveLength(50);
      const blocked = results.filter((r) => r.status === 429);
      expect(blocked).toHaveLength(10);
      flows.expectRateLimited(blocked[0]!);

      // A different client IP is unaffected.
      await flows.activateAndLogin('bf-other-ip@example.com');
      await flows.login('bf-other-ip@example.com', PASSWORD, '198.51.100.11').expect(200);
    });

    it('cannot be evaded by spoofing the left side of X-Forwarded-For (only the trusted hop counts)', async () => {
      const results = await Promise.all(
        Array.from({ length: 55 }, (_, i) =>
          flows.login(`spoof-${i}@example.com`, WRONG, `203.0.113.${i + 1}, 198.51.100.20`),
        ),
      );

      // All 55 were attributed to the real (rightmost) address 198.51.100.20.
      expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    });

    it('ignores X-Forwarded-For entirely when TRUST_PROXY_HOPS=0 (default outside a proxy)', async () => {
      const direct = await createTestApp({ config: { TRUST_PROXY_HOPS: 0 } });
      const directFlows = authFlows(direct);
      try {
        await direct.resetRateLimits();
        // Two different claimed IPs, 30 requests each. Trusting the header would give each its own
        // bucket (all 60 pass); ignoring it puts all 60 in the socket-address bucket (10 blocked).
        const results = await Promise.all(
          Array.from({ length: 60 }, (_, i) =>
            directFlows.login(
              `direct-${i}@example.com`,
              WRONG,
              i % 2 === 0 ? '198.51.100.30' : '198.51.100.31',
            ),
          ),
        );
        expect(results.filter((r) => r.status === 429)).toHaveLength(10);
      } finally {
        await direct.resetRateLimits();
        await direct.close();
      }
    });

    it('stores no raw email or IP in any Redis key', async () => {
      await flows.login('Secret.Person@Example.com', WRONG, '198.51.100.99');
      await t.http
        .post('/api/auth/forgot-password')
        .set('X-Forwarded-For', '198.51.100.99')
        .send({ email: 'Secret.Person@Example.com' });

      const keys = await t.redis.keys(`${rateLimitKeyPrefix('test')}*`);
      expect(keys.length).toBeGreaterThanOrEqual(2);
      const joined = keys.join('\n');
      expect(joined).not.toMatch(/secret|person|example\.com|198\.51\.100/i);
      for (const key of keys) {
        expect(key.slice(rateLimitKeyPrefix('test').length)).toMatch(
          /^[A-Z_]+:(ip|id):[0-9a-f]{64}$/,
        );
      }
    });

    it('expires the counters (every key has a TTL within the policy window)', async () => {
      await flows.login('ttl@example.com', WRONG);

      const keys = await t.redis.keys(`${rateLimitKeyPrefix('test')}*`);
      for (const key of keys) {
        const ttl = await t.redis.ttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(15 * 60);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('rate limits on the other public endpoints', () => {
    it('limits registration per IP (10/hour) and other IPs are unaffected', async () => {
      const ip = '198.51.100.40';
      for (let i = 0; i < 10; i++) {
        await flows
          .withIp(
            t.http
              .post('/api/auth/register')
              .send({ email: `reg-${i}@example.com`, password: PASSWORD }),
            ip,
          )
          .expect(201);
      }

      flows.expectRateLimited(
        await flows.withIp(
          t.http
            .post('/api/auth/register')
            .send({ email: 'reg-11@example.com', password: PASSWORD }),
          ip,
        ),
      );
      expect(await t.prisma.user.findUnique({ where: { email: 'reg-11@example.com' } })).toBeNull();

      await flows
        .withIp(
          t.http
            .post('/api/auth/register')
            .send({ email: 'reg-other@example.com', password: PASSWORD }),
          '198.51.100.41',
        )
        .expect(201);
    });

    it('forgot-password: same generic answers for a real and an unknown email, then the same 429', async () => {
      const real = 'fp-real@example.com';
      await insertActiveUser(real, await t.app.get(PasswordHasherService).hash(PASSWORD));

      const run = async (email: string) => {
        const out = [];
        for (let i = 0; i < 4; i++) {
          out.push(await t.http.post('/api/auth/forgot-password').send({ email }));
        }
        return out;
      };
      const realRuns = await run(real);
      const ghostRuns = await run('fp-ghost@example.com');

      expect(realRuns.map((r) => r.status)).toEqual([200, 200, 200, 429]);
      expect(ghostRuns.map((r) => r.status)).toEqual([200, 200, 200, 429]);
      expect(realRuns[0]!.body).toEqual({ accepted: true });
      expect(ghostRuns[0]!.body).toEqual({ accepted: true });
      flows.expectRateLimited(realRuns[3]!);
      flows.expectRateLimited(ghostRuns[3]!);
      expect(realRuns[3]!.body.message).toBe(ghostRuns[3]!.body.message);
    });

    it('resend-verification: same generic answers for a pending and an unknown email, then the same 429', async () => {
      const pending = 'rv-pending@example.com';
      await flows.registerPending(pending);

      const run = async (email: string) => {
        const out = [];
        for (let i = 0; i < 4; i++) {
          out.push(await t.http.post('/api/auth/resend-verification').send({ email }));
        }
        return out;
      };
      const pendingRuns = await run(pending);
      const ghostRuns = await run('rv-ghost@example.com');

      expect(pendingRuns.map((r) => r.status)).toEqual([200, 200, 200, 429]);
      expect(ghostRuns.map((r) => r.status)).toEqual([200, 200, 200, 429]);
      expect(pendingRuns[2]!.body).toEqual(ghostRuns[2]!.body);
      flows.expectRateLimited(pendingRuns[3]!);
      flows.expectRateLimited(ghostRuns[3]!);
    });

    it.each([
      ['verify-email', { email: 'nobody@example.com', code: '000000' }],
      [
        'reset-password',
        { email: 'nobody@example.com', code: '000000', newPassword: NEW_PASSWORD },
      ],
    ])('%s has a per-IP volume ceiling on top of the per-OTP attempt cap', async (path, body) => {
      const ip = '198.51.100.50';
      for (let i = 0; i < 30; i++) {
        await flows.withIp(t.http.post(`/api/auth/${path}`).send(body), ip).expect(400);
      }

      flows.expectRateLimited(await flows.withIp(t.http.post(`/api/auth/${path}`).send(body), ip));
      await flows.withIp(t.http.post(`/api/auth/${path}`).send(body), '198.51.100.51').expect(400);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('change-password brute-force protection', () => {
    it('blocks after 5 wrong current passwords; hash unchanged, sessions kept, even the right password is refused', async () => {
      const email = 'cp-bf@example.com';
      const session = await flows.activateAndLogin(email);
      const before = await t.prisma.user.findUnique({ where: { id: session.id } });
      const send = (currentPassword: string) =>
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({ currentPassword, newPassword: NEW_PASSWORD });

      for (let i = 0; i < 5; i++) {
        expect((await send(WRONG)).body).toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
      }
      flows.expectRateLimited(await send(PASSWORD));

      const after = await t.prisma.user.findUnique({ where: { id: session.id } });
      expect(after?.passwordHash).toBe(before?.passwordHash);
      expect(after?.authVersion).toBe(before?.authVersion);
      expect(
        await t.prisma.refreshToken.count({ where: { userId: session.id, revokedAt: null } }),
      ).toBeGreaterThan(0);
    });

    it('a successful change clears the counter', async () => {
      const email = 'cp-reset@example.com';
      const session = await flows.activateAndLogin(email);
      const send = (token: string, currentPassword: string, newPassword: string) =>
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword, newPassword });

      for (let i = 0; i < 4; i++) await send(session.accessToken, WRONG, NEW_PASSWORD).expect(400);
      await send(session.accessToken, PASSWORD, NEW_PASSWORD).expect(204);

      const next = await flows.login(email, NEW_PASSWORD).expect(200);
      // Counter was cleared, so five more wrong attempts are all processed (400), not blocked.
      for (let i = 0; i < 5; i++) {
        await send(next.body.accessToken, WRONG, 'AnotherPassword789').expect(400);
      }
    });

    it('proving the current password clears the counter even when the new password is rejected as identical', async () => {
      const session = await flows.activateAndLogin('cp-same@example.com');

      for (let i = 0; i < 8; i++) {
        const response = await t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ code: 'NEW_PASSWORD_SAME_AS_CURRENT' });
      }
    });

    it('is keyed per user: one blocked user does not block another', async () => {
      const a = await flows.activateAndLogin('cp-user-a@example.com');
      const b = await flows.activateAndLogin('cp-user-b@example.com');
      const send = (token: string, currentPassword: string) =>
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword, newPassword: NEW_PASSWORD });
      for (let i = 0; i < 6; i++) await send(a.accessToken, WRONG);

      await send(b.accessToken, PASSWORD).expect(204);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('atomic OTP issuance (advisory lock)', () => {
    const emailsFor = (email: string, subject: RegExp) =>
      t.mail.sent.filter((message) => message.to === email && subject.test(message.subject));

    it('two simultaneous forgot-password requests issue exactly one code and send exactly one email', async () => {
      const hash = await t.app.get(PasswordHasherService).hash(PASSWORD);

      for (let round = 0; round < 5; round++) {
        const email = `otp-forgot-${round}@example.com`;
        await insertActiveUser(email, hash);

        const [first, second] = await Promise.all([
          t.http.post('/api/auth/forgot-password').send({ email }),
          t.http.post('/api/auth/forgot-password').send({ email }),
        ]);

        expect([first.status, second.status]).toEqual([200, 200]);
        expect(first.body).toEqual({ accepted: true });
        expect(second.body).toEqual({ accepted: true });
        expect(
          await t.prisma.otpCode.count({ where: { email, purpose: OtpPurpose.PASSWORD_RESET } }),
        ).toBe(1);
        expect(emailsFor(email, /dat lai mat khau/i)).toHaveLength(1);
      }
    });

    it('three simultaneous forgot-password requests still issue exactly one code', async () => {
      const email = 'otp-forgot-three@example.com';
      await insertActiveUser(email, await t.app.get(PasswordHasherService).hash(PASSWORD));

      await Promise.all(
        Array.from({ length: 3 }, () => t.http.post('/api/auth/forgot-password').send({ email })),
      );

      expect(
        await t.prisma.otpCode.count({ where: { email, purpose: OtpPurpose.PASSWORD_RESET } }),
      ).toBe(1);
      expect(emailsFor(email, /dat lai mat khau/i)).toHaveLength(1);
    });

    it('two simultaneous resend-verification requests with no active code issue exactly one', async () => {
      for (let round = 0; round < 5; round++) {
        const email = `otp-resend-fresh-${round}@example.com`;
        await flows.registerPending(email);
        await t.prisma.otpCode.deleteMany({ where: { email } }); // no code at all: the first-issue race
        const sentBefore = emailsFor(email, /xac thuc/i).length;

        await Promise.all([
          t.http.post('/api/auth/resend-verification').send({ email }).expect(200),
          t.http.post('/api/auth/resend-verification').send({ email }).expect(200),
        ]);

        expect(
          await t.prisma.otpCode.count({
            where: { email, purpose: OtpPurpose.EMAIL_VERIFICATION },
          }),
        ).toBe(1);
        expect(emailsFor(email, /xac thuc/i).length - sentBefore).toBe(1);
      }
    });

    it('two simultaneous resends after the cooldown issue one new code and invalidate the old one', async () => {
      const email = 'otp-resend-cooldown@example.com';
      const oldCode = await flows.registerPending(email);
      await t.prisma.otpCode.updateMany({
        where: { email },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      const sentBefore = emailsFor(email, /xac thuc/i).length;

      await Promise.all([
        t.http.post('/api/auth/resend-verification').send({ email }).expect(200),
        t.http.post('/api/auth/resend-verification').send({ email }).expect(200),
      ]);

      const rows = await t.prisma.otpCode.findMany({
        where: { email },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]!.consumedAt).not.toBeNull();
      expect(rows.filter((row) => row.consumedAt === null)).toHaveLength(1);
      expect(emailsFor(email, /xac thuc/i).length - sentBefore).toBe(1);

      await t.http.post('/api/auth/verify-email').send({ email, code: oldCode }).expect(400);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('refresh-token replay detection and family revocation', () => {
    const familyTokens = async (refreshToken: string) => {
      const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
      const token = await t.prisma.refreshToken.findUnique({ where: { tokenHash } });
      return t.prisma.refreshToken.findMany({ where: { familyId: token!.familyId } });
    };

    let warn: { mock: { calls: unknown[][] }; mockRestore(): void };
    beforeEach(() => {
      warn = vi.spyOn(Logger.prototype, 'warn');
    });
    afterEach(() => {
      warn.mockRestore();
    });
    const replayLogged = () =>
      warn.mock.calls.filter(([message]) => String(message).includes('thu hoi ca family')).length;

    it('R1 -> R2, replaying R1 is rejected and R2 (same family) can no longer be used', async () => {
      const session = await flows.activateAndLogin('replay-a@example.com');
      const r2 = (await flows.refresh(session.refreshToken).expect(200)).headers;
      const replacement = refreshCookieValue(r2);

      await flows.refresh(session.refreshToken).expect(401);
      expect(replayLogged()).toBe(1);

      await flows.refresh(replacement).expect(401);
      const family = await familyTokens(session.refreshToken);
      expect(family).toHaveLength(2);
      expect(family.every((token) => token.revokedAt !== null)).toBe(true);
    });

    it('R1 -> R2 -> R3, replaying the middle token R2 also kills R3', async () => {
      const session = await flows.activateAndLogin('replay-chain@example.com');
      const r2 = refreshCookieValue(
        (await flows.refresh(session.refreshToken).expect(200)).headers,
      );
      const r3 = refreshCookieValue((await flows.refresh(r2).expect(200)).headers);

      await flows.refresh(r2).expect(401);
      await flows.refresh(r3).expect(401);
      expect((await familyTokens(session.refreshToken)).every((tk) => tk.revokedAt !== null)).toBe(
        true,
      );
    });

    it('two concurrent refreshes with the same token: one wins, one is a replay, and the winner token dies too', async () => {
      const email = 'replay-race@example.com';
      const first = await flows.activateAndLogin(email);
      // Five independent families (each login is a new family), raced one by one.
      const sessions = [first];
      for (let i = 0; i < 4; i++)
        sessions.push({ ...(await flows.loginAgain(email)), id: first.id });

      for (const session of sessions) {
        const [a, b] = await Promise.all([
          flows.refresh(session.refreshToken),
          flows.refresh(session.refreshToken),
        ]);

        expect([a.status, b.status].sort()).toEqual([200, 401]);
        const winner = a.status === 200 ? a : b;
        const winnerToken = refreshCookieValue(winner.headers);

        const family = await familyTokens(session.refreshToken);
        expect(family.every((token) => token.revokedAt !== null)).toBe(true);
        await flows.refresh(winnerToken).expect(401);
      }
      expect(replayLogged()).toBe(5);
    });

    it("replaying one family does not touch the same user's other family", async () => {
      const email = 'replay-isolation@example.com';
      const familyA = await flows.activateAndLogin(email);
      const familyB = await flows.loginAgain(email);
      await flows.refresh(familyA.refreshToken).expect(200);

      await flows.refresh(familyA.refreshToken).expect(401); // replay of A

      const stillWorks = await flows.refresh(familyB.refreshToken).expect(200);
      expect(refreshCookieValue(stillWorks.headers)).not.toBe(familyB.refreshToken);
    });

    it('a random or unknown refresh token revokes nothing and is not logged as a replay', async () => {
      const session = await flows.activateAndLogin('replay-garbage@example.com');
      const activeBefore = await t.prisma.refreshToken.count({
        where: { userId: session.id, revokedAt: null },
      });

      for (const garbage of [
        'not-a-token',
        'A'.repeat(64),
        session.refreshToken.split('').reverse().join(''),
      ]) {
        await flows.refresh(garbage).expect(401);
      }

      expect(
        await t.prisma.refreshToken.count({ where: { userId: session.id, revokedAt: null } }),
      ).toBe(activeBefore);
      expect(replayLogged()).toBe(0);
      await flows.refresh(session.refreshToken).expect(200);
    });

    it('reusing a token revoked by logout is a plain 401, not a replay', async () => {
      const email = 'replay-logout@example.com';
      const session = await flows.activateAndLogin(email);
      const other = await flows.loginAgain(email);
      await t.http
        .post('/api/auth/logout')
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .expect(204);

      await flows.refresh(session.refreshToken).expect(401);

      expect(replayLogged()).toBe(0);
      await flows.refresh(other.refreshToken).expect(200);
    });

    it('reusing a token revoked by a password change is a plain 401, not a replay', async () => {
      const session = await flows.activateAndLogin('replay-pwchange@example.com');
      await t.http
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);

      await flows.refresh(session.refreshToken).expect(401);

      expect(replayLogged()).toBe(0);
    });

    it('an expired active token is a plain 401 and revokes nothing', async () => {
      const session = await flows.activateAndLogin('replay-expired@example.com');
      await t.prisma.refreshToken.updateMany({
        where: { userId: session.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      });

      await flows.refresh(session.refreshToken).expect(401);

      expect(replayLogged()).toBe(0);
      expect(
        await t.prisma.refreshToken.count({ where: { userId: session.id, revokedAt: null } }),
      ).toBe(1);
    });

    it('never logs the raw refresh token or its hash', async () => {
      const session = await flows.activateAndLogin('replay-nolog@example.com');
      await flows.refresh(session.refreshToken).expect(200);
      await flows.refresh(session.refreshToken).expect(401);

      const hash = createHash('sha256').update(session.refreshToken).digest('hex');
      const logged = warn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
      expect(logged).not.toContain(session.refreshToken);
      expect(logged).not.toContain(hash);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('mail delivery failure logging (no recipient PII)', () => {
    const levels = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const;
    let spies: { mock: { calls: unknown[][] }; mockRestore(): void }[];

    beforeEach(() => {
      spies = levels.map((level) => vi.spyOn(Logger.prototype, level));
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** Loi SMTP gia lap lap lai dia chi nguoi nhan, nhu nhieu may chu that lam. */
    const failMail = (email: string) =>
      vi.spyOn(t.mail, 'send').mockRejectedValue(new Error(`550 5.1.1 <${email}> User unknown`));
    const everythingLogged = () =>
      spies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(' '))).join('\n');
    const failureLogged = () => /that bai/.test(everythingLogged());

    it('register still succeeds when the email cannot be sent, and logs no address', async () => {
      const email = 'mailfail-register@example.com';
      failMail(email);

      const response = await t.http
        .post('/api/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);

      expect(response.body).toEqual({ verificationRequired: true, email });
      expect(await t.prisma.user.findUnique({ where: { email } })).not.toBeNull();
      expect(failureLogged()).toBe(true);
      expect(everythingLogged()).not.toContain(email);
      expect(everythingLogged()).not.toContain('mailfail-register');
    });

    it('resend-verification still answers 200 when the email cannot be sent, and logs no address', async () => {
      const email = 'mailfail-resend@example.com';
      await flows.registerPending(email);
      await t.prisma.otpCode.updateMany({
        where: { email },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      failMail(email);

      await t.http.post('/api/auth/resend-verification').send({ email }).expect(200);

      expect(failureLogged()).toBe(true);
      expect(everythingLogged()).not.toContain('mailfail-resend');
    });

    it('forgot-password still answers 200 when the email cannot be sent, and logs no address', async () => {
      const email = 'mailfail-forgot@example.com';
      await insertActiveUser(email, await t.app.get(PasswordHasherService).hash(PASSWORD));
      failMail(email);

      const response = await t.http.post('/api/auth/forgot-password').send({ email }).expect(200);

      expect(response.body).toEqual({ accepted: true });
      expect(await t.prisma.otpCode.count({ where: { email } })).toBe(1);
      expect(failureLogged()).toBe(true);
      expect(everythingLogged()).not.toContain('mailfail-forgot');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('access-token invalidation after a credential change (authVersion)', () => {
    const authVersionOf = async (id: string) =>
      (await t.prisma.user.findUnique({ where: { id } }))!.authVersion;

    it('change-password: the old access token dies immediately, a fresh login works, version is 1', async () => {
      const email = 'av-change@example.com';
      const session = await flows.activateAndLogin(email);
      await flows.me(session.accessToken).expect(200);
      expect(await authVersionOf(session.id)).toBe(0);

      await t.http
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);

      expect((await flows.me(session.accessToken)).status).toBe(401);
      expect(await authVersionOf(session.id)).toBe(1);

      const relogin = await flows.login(email, NEW_PASSWORD).expect(200);
      await flows.me(relogin.body.accessToken).expect(200);
      const payload = await t.app.get(JwtService).verifyAsync(relogin.body.accessToken);
      expect(payload.ver).toBe(1);
    });

    it('reset-password: the old access token dies immediately and version is 1', async () => {
      const email = 'av-reset@example.com';
      const session = await flows.activateAndLogin(email);
      const code = await flows.requestPasswordReset(email);

      await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword: NEW_PASSWORD })
        .expect(200);

      expect((await flows.me(session.accessToken)).status).toBe(401);
      expect(await authVersionOf(session.id)).toBe(1);
      await flows.login(email, NEW_PASSWORD).expect(200);
    });

    it('a change followed by a reset ends at version 2 and only the newest token works', async () => {
      const email = 'av-both@example.com';
      const first = await flows.activateAndLogin(email);
      await t.http
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);
      const middle = await flows.login(email, NEW_PASSWORD).expect(200);
      const code = await flows.requestPasswordReset(email);
      await t.http
        .post('/api/auth/reset-password')
        .send({ email, code, newPassword: 'ThirdPassword789' })
        .expect(200);

      expect(await authVersionOf(first.id)).toBe(2);
      expect((await flows.me(first.accessToken)).status).toBe(401);
      expect((await flows.me(middle.body.accessToken)).status).toBe(401);
      const latest = await flows.login(email, 'ThirdPassword789').expect(200);
      await flows.me(latest.body.accessToken).expect(200);
    });

    it('failed credential changes never increment the version', async () => {
      const email = 'av-failed@example.com';
      const session = await flows.activateAndLogin(email);
      const send = (body: Record<string, string>) =>
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send(body);

      await send({ currentPassword: WRONG, newPassword: NEW_PASSWORD }).expect(400);
      await send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(400);
      await send({ currentPassword: PASSWORD, newPassword: 'weakpass' }).expect(400);
      await flows.requestPasswordReset(email);
      await t.http
        .post('/api/auth/reset-password')
        .send({ email, code: '000000', newPassword: NEW_PASSWORD })
        .expect(400);
      await t.http
        .post('/api/auth/reset-password')
        .send({ email, code: '000000', newPassword: 'weakpass' })
        .expect(400);

      expect(await authVersionOf(session.id)).toBe(0);
      await flows.me(session.accessToken).expect(200);
    });

    it('two concurrent changes: exactly one wins and the version is bumped exactly once', async () => {
      const session = await flows.activateAndLogin('av-race@example.com');
      const send = (newPassword: string) =>
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${session.accessToken}`)
          .send({ currentPassword: PASSWORD, newPassword });

      const [a, b] = await Promise.all([send('FirstNewPassword1'), send('SecondNewPassword2')]);

      expect([a.status, b.status].sort()).toEqual([204, 400]);
      expect(await authVersionOf(session.id)).toBe(1);
    });

    it('deploy compatibility: a token WITHOUT a ver claim still works at version 0 and dies after a change', async () => {
      const email = 'av-legacy@example.com';
      const session = await flows.activateAndLogin(email);
      const legacy = await t.app.get(JwtService).signAsync({ sub: session.id }, { expiresIn: 60 }); // exactly what pre-PH3.4 code issued
      await flows.me(legacy).expect(200);

      await t.http
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);

      expect((await flows.me(legacy)).status).toBe(401);
    });

    it('rejects a token whose ver does not equal the current version, in either direction', async () => {
      const session = await flows.activateAndLogin('av-mismatch@example.com');
      const jwt = t.app.get(JwtService);

      for (const ver of [1, 999, -1]) {
        const token = await jwt.signAsync({ sub: session.id, ver }, { expiresIn: 60 });
        expect((await flows.me(token)).status).toBe(401);
      }
    });

    it('a refreshed access token carries the current version', async () => {
      const email = 'av-refresh@example.com';
      const session = await flows.activateAndLogin(email);
      await t.prisma.user.update({ where: { id: session.id }, data: { authVersion: 3 } });

      // The pre-bump token is stale, but the refresh cookie is still valid and yields a v3 token.
      expect((await flows.me(session.accessToken)).status).toBe(401);
      const refreshed = await flows.refresh(session.refreshToken).expect(200);
      const payload = await t.app.get(JwtService).verifyAsync(refreshed.body.accessToken);
      expect(payload.ver).toBe(3);
      await flows.me(refreshed.body.accessToken).expect(200);
    });
  });
});

// -------------------------------------------------------------------------------------------------
describe('PH3.4 rate-limit store outage policy (store replaced by one that always fails)', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;
  const email = 'outage-user@example.com';

  beforeAll(async () => {
    t = await createTestApp({ failingRateLimiter: true });
    flows = authFlows(t);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    const passwordHash = await t.app.get(PasswordHasherService).hash(PASSWORD);
    await t.prisma.user.create({ data: { email, passwordHash, status: UserStatus.ACTIVE } });
  });

  afterAll(async () => {
    await t.close();
  });

  it('login fails OPEN: correct password logs in and a wrong one is a normal 401 (never 500/429)', async () => {
    await flows.login(email).expect(200);
    await flows.login(email, WRONG).expect(401);
  });

  it('verify-email and reset-password fail OPEN: business answers, not an outage', async () => {
    const verify = await t.http
      .post('/api/auth/verify-email')
      .send({ email, code: '000000' })
      .expect(400);
    expect(verify.body).toMatchObject({ code: 'OTP_INVALID' });
    await t.http
      .post('/api/auth/reset-password')
      .send({ email, code: '000000', newPassword: NEW_PASSWORD })
      .expect(400);
  });

  it('change-password fails OPEN', async () => {
    const login = await flows.login(email).expect(200);
    await t.http
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);
  });

  it('register fails CLOSED with a 503 that hides the cause, creating no user and sending no email', async () => {
    const response = await t.http
      .post('/api/auth/register')
      .send({ email: 'outage-new@example.com', password: PASSWORD })
      .expect(503);

    expect(response.body).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(JSON.stringify(response.body)).not.toMatch(/redis|rate|limit|unavailable store/i);
    expect(
      await t.prisma.user.findUnique({ where: { email: 'outage-new@example.com' } }),
    ).toBeNull();
    expect(t.mail.sent.some((message) => message.to === 'outage-new@example.com')).toBe(false);
  });

  it.each(['forgot-password', 'resend-verification'])(
    '%s fails CLOSED: 503, no OTP row and no email',
    async (path) => {
      const sentBefore = t.mail.sent.length;

      await t.http.post(`/api/auth/${path}`).send({ email }).expect(503);

      expect(await t.prisma.otpCode.count({ where: { email } })).toBe(0);
      expect(t.mail.sent.length).toBe(sentBefore);
    },
  );
});
