import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UserStatus } from '../src/generated/prisma/client.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { authFlows, PASSWORD, refreshCookieValue } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const ADMIN_EMAIL = 'quan.tri@example.test';
const TARGET_EMAIL = 'nguoi.bi.khoa@example.test';
const SAFE_KEYS = ['createdAt', 'email', 'emailVerifiedAt', 'id', 'roles', 'status'];
const ITERATIONS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('UC-02.1 Quan tri tai khoan, Admin.2: khoa va mo khoa (POST /api/admin/users/:id/lock|unlock)', () => {
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

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const lock = (id: string, token?: string) => {
    const request = t.http.post(`/api/admin/users/${id}/lock`);
    return token ? request.set(bearer(token)) : request;
  };
  const unlock = (id: string, token?: string) => {
    const request = t.http.post(`/api/admin/users/${id}/unlock`);
    return token ? request.set(bearer(token)) : request;
  };

  async function adminSession() {
    const session = await flows.activateAndLogin(ADMIN_EMAIL);
    expect((await grantAdminRole(t.prisma, ADMIN_EMAIL)).outcome).toBe('GRANTED');
    return session;
  }

  const userState = (id: string) =>
    t.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { status: true, authVersion: true },
    });
  const activeRefreshTokens = (userId: string) =>
    t.prisma.refreshToken.count({ where: { userId, revokedAt: null } });
  const auditFor = (entityId: string) =>
    t.prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

  function expectCode(response: { body: unknown }, statusCode: number, code: string): void {
    expect(response.body).toMatchObject({ statusCode, code });
  }

  describe('phan quyen', () => {
    it('anonymous: lock va unlock 401, ke ca id sai dang', async () => {
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      expectCode(await lock(target.id).expect(401), 401, 'UNAUTHORIZED');
      expectCode(await unlock(target.id).expect(401), 401, 'UNAUTHORIZED');
      await lock('khong-phai-uuid').expect(401);
      expect(await userState(target.id)).toMatchObject({ status: UserStatus.ACTIVE });
    });

    it('CUSTOMER: lock va unlock 403, khong doi gi, khong ghi nhat ky', async () => {
      const target = await flows.activateAndLogin(TARGET_EMAIL);
      const customer = await flows.activateAndLogin('khach.khac@example.test');

      expectCode(await lock(target.id, customer.accessToken).expect(403), 403, 'FORBIDDEN');
      expectCode(await unlock(target.id, customer.accessToken).expect(403), 403, 'FORBIDDEN');
      expectCode(await lock(customer.id, customer.accessToken).expect(403), 403, 'FORBIDDEN');

      expect(await userState(target.id)).toEqual({ status: UserStatus.ACTIVE, authVersion: 0 });
      expect(await t.prisma.auditLog.count()).toBe(0);
    });
  });

  describe('ADMIN thanh cong', () => {
    it('lock ACTIVE: 200 dang an toan, LOCKED, authVersion +1, thu hoi moi refresh, mot dong nhat ky', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);
      await flows.loginAgain(TARGET_EMAIL); // phien thu hai: phai bi thu hoi ca hai
      expect(await activeRefreshTokens(target.id)).toBe(2);

      const response = await lock(target.id, admin.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(SAFE_KEYS);
      expect(response.body).toMatchObject({ id: target.id, status: 'LOCKED' });
      expect(response.text).not.toContain('authVersion');
      expect(response.text).not.toContain('passwordHash');
      expect(await userState(target.id)).toEqual({ status: UserStatus.LOCKED, authVersion: 1 });
      expect(await activeRefreshTokens(target.id)).toBe(0);

      const audit = await auditFor(target.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorUserId: admin.id,
        action: 'LOCK_USER',
        entityType: 'USER',
        entityId: target.id,
        metadata: { fromStatus: 'ACTIVE', toStatus: 'LOCKED', revokedSessions: 2 },
      });
      expect(JSON.stringify(audit[0]!.metadata)).not.toContain('@');
    });

    it('unlock LOCKED: 200 ACTIVE, authVersion giu nguyen, khong phuc hoi refresh, co nhat ky', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);
      await lock(target.id, admin.accessToken).expect(200);

      const response = await unlock(target.id, admin.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(SAFE_KEYS);
      expect(response.body).toMatchObject({ id: target.id, status: 'ACTIVE' });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await userState(target.id)).toEqual({ status: UserStatus.ACTIVE, authVersion: 1 });
      expect(await activeRefreshTokens(target.id)).toBe(0);

      const audit = await auditFor(target.id);
      expect(audit.map((row) => row.action)).toEqual(['LOCK_USER', 'UNLOCK_USER']);
      expect(audit[1]).toMatchObject({
        actorUserId: admin.id,
        entityType: 'USER',
        metadata: { fromStatus: 'LOCKED', toStatus: 'ACTIVE' },
      });
    });
  });

  describe('loi nghiep vu: khong doi trang thai, khong ghi nhat ky', () => {
    it('tu khoa chinh minh: 422 CANNOT_LOCK_SELF', async () => {
      const admin = await adminSession();

      const response = await lock(admin.id, admin.accessToken).expect(422);

      expectCode(response, 422, 'CANNOT_LOCK_SELF');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(await userState(admin.id)).toEqual({ status: UserStatus.ACTIVE, authVersion: 0 });
      expect(await t.prisma.auditLog.count()).toBe(0);
    });

    it('lock tai khoan da LOCKED: 409, authVersion khong tang lan hai, chi mot dong nhat ky', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);
      await lock(target.id, admin.accessToken).expect(200);

      expectCode(await lock(target.id, admin.accessToken).expect(409), 409, 'USER_NOT_ACTIVE');
      expect(await userState(target.id)).toEqual({ status: UserStatus.LOCKED, authVersion: 1 });
      expect(await auditFor(target.id)).toHaveLength(1);
    });

    it('unlock tai khoan ACTIVE: 409 USER_NOT_LOCKED', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      expectCode(await unlock(target.id, admin.accessToken).expect(409), 409, 'USER_NOT_LOCKED');
      expect(await userState(target.id)).toEqual({ status: UserStatus.ACTIVE, authVersion: 0 });
    });

    it('PENDING_VERIFICATION va DISABLED: khong lock, khong unlock duoc (409)', async () => {
      const admin = await adminSession();
      await flows.registerPending(TARGET_EMAIL);
      const pending = await t.prisma.user.findUniqueOrThrow({ where: { email: TARGET_EMAIL } });
      const disabled = await t.prisma.user.create({
        data: {
          email: 'bi.vo.hieu@example.test',
          passwordHash: 'khong-dung',
          status: UserStatus.DISABLED,
        },
      });

      for (const id of [pending.id, disabled.id]) {
        expectCode(await lock(id, admin.accessToken).expect(409), 409, 'USER_NOT_ACTIVE');
        expectCode(await unlock(id, admin.accessToken).expect(409), 409, 'USER_NOT_LOCKED');
      }
      expect(await userState(pending.id)).toEqual({
        status: UserStatus.PENDING_VERIFICATION,
        authVersion: 0,
      });
      expect(await userState(disabled.id)).toEqual({ status: UserStatus.DISABLED, authVersion: 0 });
      expect(await t.prisma.auditLog.count()).toBe(0);
    });

    it('UUID khong ton tai 404; id sai dang 400; ca hai giu no-store', async () => {
      const admin = await adminSession();

      for (const call of [lock, unlock]) {
        const missing = await call(randomUUID(), admin.accessToken).expect(404);
        expectCode(missing, 404, 'NOT_FOUND');
        expect(missing.headers['cache-control']).toBe('no-store');
        expectCode(await call('123', admin.accessToken).expect(400), 400, 'BAD_REQUEST');
      }
      expect(await t.prisma.auditLog.count()).toBe(0);
    });
  });

  describe('phien dang nhap: khoa giet phien cu, mo khoa khong lam song lai', () => {
    it('access va refresh cu chet sau lock, van chet sau unlock; dang nhap moi thi duoc', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);
      await flows.me(target.accessToken).expect(200);
      const before = await userState(target.id);

      await lock(target.id, admin.accessToken).expect(200);
      expect((await userState(target.id)).authVersion).toBe(before.authVersion + 1);
      expectCode(await flows.me(target.accessToken).expect(401), 401, 'UNAUTHORIZED');
      await flows.refresh(target.refreshToken).expect(401);
      await flows.login(TARGET_EMAIL).expect(401); // dang bi khoa: dang nhap cung khong duoc

      await unlock(target.id, admin.accessToken).expect(200);
      expect((await userState(target.id)).authVersion).toBe(before.authVersion + 1);
      await flows.me(target.accessToken).expect(401);
      await flows.refresh(target.refreshToken).expect(401);

      const fresh = await flows.login(TARGET_EMAIL, PASSWORD).expect(200);
      await flows.me(fresh.body.accessToken as string).expect(200);
      await flows.refresh(refreshCookieValue(fresh.headers)).expect(200);
    });
  });

  describe(`dong thoi (lap ${ITERATIONS} lan moi bai)`, () => {
    it('hai lock cung luc: dung mot 200 va mot 409, khong 500, mot dong nhat ky, authVersion +1', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      for (let round = 1; round <= ITERATIONS; round += 1) {
        await t.resetRateLimits();
        await flows.loginAgain(TARGET_EMAIL); // luon co phien moi de thu hoi
        const statuses = (
          await Promise.all([
            lock(target.id, admin.accessToken),
            lock(target.id, admin.accessToken),
          ])
        ).map((response) => response.status);

        expect(statuses.sort()).toEqual([200, 409]);
        expect(await userState(target.id)).toEqual({
          status: UserStatus.LOCKED,
          authVersion: round,
        });
        expect(await activeRefreshTokens(target.id)).toBe(0);
        await unlock(target.id, admin.accessToken).expect(200);
      }

      const actions = (await auditFor(target.id)).map((row) => row.action);
      expect(actions.filter((action) => action === 'LOCK_USER')).toHaveLength(ITERATIONS);
      expect(actions.filter((action) => action === 'UNLOCK_USER')).toHaveLength(ITERATIONS);
    });

    it('hai unlock cung luc: dung mot 200 va mot 409, mot dong nhat ky', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      for (let round = 1; round <= ITERATIONS; round += 1) {
        await lock(target.id, admin.accessToken).expect(200);
        const statuses = (
          await Promise.all([
            unlock(target.id, admin.accessToken),
            unlock(target.id, admin.accessToken),
          ])
        ).map((response) => response.status);

        expect(statuses.sort()).toEqual([200, 409]);
        expect(await userState(target.id)).toEqual({
          status: UserStatus.ACTIVE,
          authVersion: round,
        });
      }
      const actions = (await auditFor(target.id)).map((row) => row.action);
      expect(actions.filter((action) => action === 'UNLOCK_USER')).toHaveLength(ITERATIONS);
    });

    it('lock va unlock cung luc: khong 500, trang thai cuoi khop nhat ky', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      for (let round = 1; round <= ITERATIONS; round += 1) {
        const [locked, unlocked] = await Promise.all([
          lock(target.id, admin.accessToken),
          unlock(target.id, admin.accessToken),
        ]);
        expect(locked.status).toBe(200);
        expect([200, 409]).toContain(unlocked.status);
        // unlock chi thanh cong khi chay SAU lock, nen trang thai cuoi suy ra duoc tu ket qua.
        const expected = unlocked.status === 200 ? UserStatus.ACTIVE : UserStatus.LOCKED;
        expect((await userState(target.id)).status).toBe(expected);
        if (expected === UserStatus.LOCKED) await unlock(target.id, admin.accessToken).expect(200);
      }
      const actions = (await auditFor(target.id)).map((row) => row.action);
      expect(actions.filter((action) => action === 'LOCK_USER')).toHaveLength(ITERATIONS);
      expect(actions.filter((action) => action === 'UNLOCK_USER')).toHaveLength(ITERATIONS);
    });

    it('lock trong luc dang nhap dang tinh bcrypt: khong de lai refresh token song lai sau unlock', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      for (let round = 1; round <= ITERATIONS; round += 1) {
        await t.resetRateLimits();
        const pendingLogin = flows.login(TARGET_EMAIL).then((response) => response);
        await sleep(60); // dang nhap da doc user va dang bam bcrypt
        await lock(target.id, admin.accessToken).expect(200);
        const login = await pendingLogin;

        expect([200, 401]).toContain(login.status);
        expect(await activeRefreshTokens(target.id)).toBe(0);

        await unlock(target.id, admin.accessToken).expect(200);
        if (login.status === 200) {
          await flows.refresh(refreshCookieValue(login.headers)).expect(401);
          await flows.me(login.body.accessToken as string).expect(401);
        }
      }
    });

    it('lock trong luc refresh dang xoay: token vua xoay cung bi thu hoi', async () => {
      const admin = await adminSession();
      const target = await flows.activateAndLogin(TARGET_EMAIL);

      for (let round = 1; round <= ITERATIONS; round += 1) {
        await t.resetRateLimits();
        const session = await flows.loginAgain(TARGET_EMAIL);
        const [refreshed] = await Promise.all([
          flows.refresh(session.refreshToken),
          lock(target.id, admin.accessToken).expect(200),
        ]);

        expect([200, 401]).toContain(refreshed.status);
        expect(await activeRefreshTokens(target.id)).toBe(0);

        await unlock(target.id, admin.accessToken).expect(200);
        if (refreshed.status === 200) {
          await flows.refresh(refreshCookieValue(refreshed.headers)).expect(401);
        }
      }
    });
  });
});
