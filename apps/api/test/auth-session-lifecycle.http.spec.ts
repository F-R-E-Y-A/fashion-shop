import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TokenService } from '../src/modules/auth/token.service.js';
import { authFlows, PASSWORD, refreshCookieValue } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/*
 * Regression cho Issue #43: logout thu hoi CA family va xep hang dung voi refresh. Hai bai "thu tu ep
 * buoc" giu khoa dong refresh token bang mot giao dich chan, cho tung request vao hang doi khoa
 * (doc pg_stat_activity), roi moi nha: thu tu khong phu thuoc may man. Ma UC-01.4 la ma DE XUAT o
 * PR #26 (chua gop, chua duyet); tieu chi o docs/features/auth/session-lifecycle.md.
 */

const EMAIL = 'phien.dang.nhap@example.test';
const ITERATIONS = 5;

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('UC-01.4 Lam moi phien va dang xuat: logout thu hoi ca family (#43)', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;
  let tokens: TokenService;

  beforeAll(async () => {
    t = await createTestApp();
    flows = authFlows(t);
    tokens = t.app.get(TokenService);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
  });

  afterAll(async () => {
    await t.close();
  });

  const logout = (refreshToken: string) =>
    t.http.post('/api/auth/logout').set('Cookie', `refresh_token=${refreshToken}`);

  const familyOf = async (refreshToken: string) =>
    (
      await t.prisma.refreshToken.findUniqueOrThrow({
        where: { tokenHash: tokens.hashRefreshToken(refreshToken) },
        select: { familyId: true },
      })
    ).familyId;

  const activeInFamily = (familyId: string) =>
    t.prisma.refreshToken.count({ where: { familyId, revokedAt: null } });

  /** Giu khoa FOR UPDATE tren dong cua mot refresh token cho toi khi goi release(). */
  async function blockTokenRow(refreshToken: string) {
    const acquired = deferred();
    const release = deferred();
    const tokenHash = tokens.hashRefreshToken(refreshToken);
    const done = t.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT "id" FROM "refresh_tokens" WHERE "token_hash" = ${tokenHash} FOR UPDATE
        `;
        acquired.resolve();
        await release.promise;
      },
      { timeout: 20_000 },
    );
    await acquired.promise;
    return { release: () => release.resolve(), done };
  }

  /** Cho toi khi it nhat `count` phien Postgres cua CSDL kiem thu dang dung cho mot khoa. */
  async function waitForLockWaiters(count: number) {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const [row] = await t.prisma.$queryRaw<{ waiting: number }[]>`
        SELECT count(*)::int AS "waiting" FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `;
      if ((row?.waiting ?? 0) >= count) return;
      if (Date.now() > deadline) throw new Error(`Khong thay ${count} request cho khoa`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it('UC-01.4/AC5 logout mang token vua bi xoay van thu hoi token moi cua cung family', async () => {
    const session = await flows.activateAndLogin(EMAIL);
    const family = await familyOf(session.refreshToken);
    const rotated = await flows.refresh(session.refreshToken).expect(200);

    await logout(session.refreshToken).expect(204);

    await flows.refresh(refreshCookieValue(rotated.headers)).expect(401);
    expect(await activeInFamily(family)).toBe(0);
  });

  it('UC-01.4/AC5 logout khong dung toi family khac cua cung nguoi dung', async () => {
    const first = await flows.activateAndLogin(EMAIL);
    const second = await flows.loginAgain(EMAIL);

    await logout(first.refreshToken).expect(204);

    await flows.refresh(first.refreshToken).expect(401);
    await flows.refresh(second.refreshToken).expect(200);
  });

  it('UC-01.4/AC5 token la hoac khong co cookie: 204, khong thu hoi gi', async () => {
    const session = await flows.activateAndLogin(EMAIL);

    await logout('khong-phai-token-that').expect(204);
    await t.http.post('/api/auth/logout').expect(204);

    await flows.refresh(session.refreshToken).expect(200);
  });

  it('UC-01.4/AC5 thu tu ep buoc: refresh dang xoay truoc, logout den sau van thu hoi token vua xoay', async () => {
    const session = await flows.activateAndLogin(EMAIL);
    const family = await familyOf(session.refreshToken);
    const blocker = await blockTokenRow(session.refreshToken);

    const refreshing = flows.refresh(session.refreshToken).then((response) => response);
    await waitForLockWaiters(1);
    const loggingOut = logout(session.refreshToken).then((response) => response);
    await waitForLockWaiters(2);
    blocker.release();
    await blocker.done;

    const [refreshed, loggedOut] = await Promise.all([refreshing, loggingOut]);
    expect(refreshed.status).toBe(200);
    expect(loggedOut.status).toBe(204);
    await flows.refresh(refreshCookieValue(refreshed.headers)).expect(401);
    expect(await activeInFamily(family)).toBe(0);
  });

  it('UC-01.4/AC5 thu tu ep buoc: logout truoc, refresh den sau tra 401, family khac van song', async () => {
    const session = await flows.activateAndLogin(EMAIL);
    const other = await flows.loginAgain(EMAIL);
    const family = await familyOf(session.refreshToken);
    const blocker = await blockTokenRow(session.refreshToken);

    const loggingOut = logout(session.refreshToken).then((response) => response);
    await waitForLockWaiters(1);
    const refreshing = flows.refresh(session.refreshToken).then((response) => response);
    await waitForLockWaiters(2);
    blocker.release();
    await blocker.done;

    const [loggedOut, refreshed] = await Promise.all([loggingOut, refreshing]);
    expect(loggedOut.status).toBe(204);
    expect(refreshed.status).toBe(401);
    expect(await activeInFamily(family)).toBe(0);
    await flows.refresh(other.refreshToken).expect(200);
  });

  it(`UC-01.4/AC5 logout song song refresh (${ITERATIONS} vong): khong 500, family khong con token song`, async () => {
    await flows.activateAndLogin(EMAIL);

    for (let round = 1; round <= ITERATIONS; round += 1) {
      await t.resetRateLimits();
      const session = await flows.loginAgain(EMAIL);
      const family = await familyOf(session.refreshToken);
      const [refreshed, loggedOut] = await Promise.all([
        flows.refresh(session.refreshToken).then((response) => response),
        logout(session.refreshToken).then((response) => response),
      ]);

      expect([200, 401]).toContain(refreshed.status);
      expect(loggedOut.status).toBe(204);
      expect(await activeInFamily(family)).toBe(0);
    }
  });

  it(`UC-01.4/AC5 logout song song dang nhap va doi mat khau (${ITERATIONS} vong): khong 500, khong ket khoa`, async () => {
    await flows.activateAndLogin(EMAIL);
    let password = PASSWORD;

    for (let round = 1; round <= ITERATIONS; round += 1) {
      await t.resetRateLimits();
      const session = await flows.login(EMAIL, password).expect(200);
      const accessToken = session.body.accessToken as string;
      const nextPassword = `${PASSWORD}${round}`;
      const [loggedOut, loggedIn, changed] = await Promise.all([
        logout(refreshCookieValue(session.headers)).then((response) => response),
        flows.login(EMAIL, password).then((response) => response),
        t.http
          .post('/api/auth/change-password')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ currentPassword: password, newPassword: nextPassword })
          .then((response) => response),
      ]);

      expect(loggedOut.status).toBe(204);
      expect([200, 401]).toContain(loggedIn.status);
      expect(changed.status).toBe(204);
      password = nextPassword;
      // Doi mat khau thu hoi moi phien: khong token nao cua nguoi dung con song.
      expect(await t.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    }
  });
});
