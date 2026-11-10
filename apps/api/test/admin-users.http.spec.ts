import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedIdentity } from '../prisma/seed/identity.seed.js';
import { UserStatus } from '../src/generated/prisma/client.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { RoleCode } from '../src/modules/auth/role-code.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const ADMIN_EMAIL = 'quan.tri@example.test';
const CUSTOMER_EMAIL = 'khach.hang@example.test';
const SAFE_KEYS = ['createdAt', 'email', 'emailVerifiedAt', 'id', 'roles', 'status'];

describe('UC-02.1 Quan tri tai khoan, Admin.1: GET /api/admin/users (T-M5)', () => {
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
  const list = (token?: string, query = '') => {
    const request = t.http.get(`/api/admin/users${query}`);
    return token ? request.set(bearer(token)) : request;
  };
  const detail = (id: string, token?: string) => {
    const request = t.http.get(`/api/admin/users/${id}`);
    return token ? request.set(bearer(token)) : request;
  };

  async function customerSession() {
    return flows.activateAndLogin(CUSTOMER_EMAIL);
  }

  /** Tai khoan tu dang ky roi duoc nang quyen bang dung ham ma script admin:grant dung. */
  async function adminSession() {
    const session = await flows.activateAndLogin(ADMIN_EMAIL);
    expect(await grantAdminRole(t.prisma, ADMIN_EMAIL)).toEqual({
      outcome: 'GRANTED',
      userId: session.id,
    });
    return session;
  }

  function expectUnauthorized(response: { body: unknown }): void {
    expect(response.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
  }

  function expectForbidden(response: { body: unknown }): void {
    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Khong du quyen truy cap',
    });
  }

  describe('danh muc vai den tu migration, khong tu seed', () => {
    it('bang roles co dung CUSTOMER va ADMIN, va seedIdentity khong ghi them gi', async () => {
      const expected = [
        { code: RoleCode.ADMIN, name: 'Administrator' },
        { code: RoleCode.CUSTOMER, name: 'Customer' },
      ];
      const roles = () => t.prisma.role.findMany({ select: { code: true, name: true } });

      expect((await roles()).sort((a, b) => a.code.localeCompare(b.code))).toEqual(expected);
      await expect(seedIdentity(t.prisma)).resolves.toEqual({ roles: 2 });
      expect(await roles()).toHaveLength(2);
    });

    it('dang ky van gan CUSTOMER khi vai chi den tu migration', async () => {
      const session = await customerSession();
      const user = await t.prisma.user.findUniqueOrThrow({
        where: { id: session.id },
        select: { userRoles: { select: { role: { select: { code: true } } } } },
      });
      expect(user.userRoles.map(({ role }) => role.code)).toEqual([RoleCode.CUSTOMER]);
    });
  });

  describe('anonymous: 401', () => {
    it('GET list va GET detail deu 401, ke ca khi id sai dang (guard chay truoc validation)', async () => {
      expectUnauthorized(await list().expect(401));
      expectUnauthorized(await detail(randomUUID()).expect(401));
      expectUnauthorized(await detail('khong-phai-uuid').expect(401));
    });

    it('token gia hay sai dinh dang cung 401', async () => {
      expectUnauthorized(await list('khong-phai-jwt').expect(401));
      expectUnauthorized(
        await t.http.get('/api/admin/users').set('Authorization', 'Basic x').expect(401),
      );
    });
  });

  describe('CUSTOMER: 403 FORBIDDEN', () => {
    it('GET list va GET detail (ke ca chinh minh, ke ca id sai dang) deu 403', async () => {
      const customer = await customerSession();

      expectForbidden(await list(customer.accessToken).expect(403));
      expectForbidden(await detail(customer.id, customer.accessToken).expect(403));
      expectForbidden(await detail(randomUUID(), customer.accessToken).expect(403));
      expectForbidden(await detail('khong-phai-uuid', customer.accessToken).expect(403));
    });
  });

  describe('ADMIN: 200', () => {
    it('GET list tra Page chi gom truong an toan, vai dung', async () => {
      const customer = await customerSession();
      const admin = await adminSession();

      const response = await list(admin.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 12, totalPages: 1 });
      const items = response.body.items as Array<Record<string, unknown>>;
      for (const item of items) expect(Object.keys(item).sort()).toEqual(SAFE_KEYS);
      expect(items.find((item) => item.id === admin.id)).toMatchObject({
        email: ADMIN_EMAIL,
        status: 'ACTIVE',
        roles: [RoleCode.ADMIN, RoleCode.CUSTOMER],
        emailVerifiedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
      });
      expect(items.find((item) => item.id === customer.id)).toMatchObject({
        email: CUSTOMER_EMAIL,
        roles: [RoleCode.CUSTOMER],
      });
    });

    it('GET detail tra dung mot tai khoan, dung hinh dang an toan', async () => {
      const customer = await customerSession();
      const admin = await adminSession();

      const response = await detail(customer.id, admin.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(SAFE_KEYS);
      expect(response.body).toMatchObject({
        id: customer.id,
        email: CUSTOMER_EMAIL,
        status: 'ACTIVE',
        roles: [RoleCode.CUSTOMER],
      });
    });

    it('khong lo passwordHash, authVersion, token hay OTP: ca ten truong lan gia tri', async () => {
      const customer = await customerSession();
      const admin = await adminSession();
      // Tang authVersion de gia tri khong trung so 0 vo tinh xuat hien o cho khac.
      await t.prisma.user.update({ where: { id: customer.id }, data: { authVersion: 7 } });
      const stored = await t.prisma.user.findUniqueOrThrow({
        where: { id: customer.id },
        select: { passwordHash: true },
      });

      for (const response of [
        await list(admin.accessToken).expect(200),
        await detail(customer.id, admin.accessToken).expect(200),
      ]) {
        const raw = response.text;
        expect(raw).not.toContain(stored.passwordHash);
        for (const key of [
          'passwordHash',
          'authVersion',
          'refreshToken',
          'tokenHash',
          'codeHash',
        ]) {
          expect(raw).not.toContain(key);
        }
      }
    });

    it('UUID hop le ma khong co thi 404; id sai dang thi 400', async () => {
      const admin = await adminSession();

      const notFound = await detail(randomUUID(), admin.accessToken).expect(404);
      expect(notFound.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
      expect(notFound.headers['cache-control']).toBe('no-store');
      expect((await detail('123', admin.accessToken).expect(400)).body).toMatchObject({
        statusCode: 400,
        code: 'BAD_REQUEST',
        message: ['id phai la UUID'],
      });
    });
  });

  describe('phan trang', () => {
    it('moi nhat truoc, cac trang khong trung khong sot, moi trang thai deu hien', async () => {
      const admin = await adminSession();
      const statuses = [
        UserStatus.PENDING_VERIFICATION,
        UserStatus.LOCKED,
        UserStatus.DISABLED,
        UserStatus.ACTIVE,
        UserStatus.ACTIVE,
      ];
      await t.prisma.user.createMany({
        data: statuses.map((status, index) => ({
          email: `phan.trang.${index}@example.test`,
          passwordHash: 'khong-dung-de-dang-nhap',
          status,
          createdAt: new Date(Date.UTC(2026, 0, 1 + index)),
        })),
      });

      const pages = [];
      for (const page of [1, 2, 3]) {
        const response = await list(admin.accessToken, `?page=${page}&pageSize=2`).expect(200);
        expect(response.body).toMatchObject({ total: 6, page, pageSize: 2, totalPages: 3 });
        pages.push(response.body.items as Array<{ id: string; email: string; status: string }>);
      }

      expect(pages.map((items) => items.length)).toEqual([2, 2, 2]);
      const emails = pages.flat().map((item) => item.email);
      expect(new Set(emails).size).toBe(6);
      // Admin vua tao la moi nhat; fixture xep theo createdAt giam dan.
      expect(emails).toEqual([
        ADMIN_EMAIL,
        'phan.trang.4@example.test',
        'phan.trang.3@example.test',
        'phan.trang.2@example.test',
        'phan.trang.1@example.test',
        'phan.trang.0@example.test',
      ]);
      expect(pages.flat().map((item) => item.status)).toEqual(
        expect.arrayContaining(['PENDING_VERIFICATION', 'LOCKED', 'DISABLED']),
      );

      const beyond = await list(admin.accessToken, '?page=9&pageSize=2').expect(200);
      expect(beyond.body).toMatchObject({ items: [], total: 6, page: 9, totalPages: 3 });
    });

    it('tham so sai hoac chua ho tro (search) tra 400; bo loc hop le xem admin-users-filters', async () => {
      const admin = await adminSession();

      for (const query of ['?page=0', '?pageSize=61', '?pageSize=abc', '?search=a']) {
        const response = await list(admin.accessToken, query).expect(400);
        expect(response.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
      }
    });
  });

  describe('vai va trang thai doc tu CSDL moi request (AuthGuard), khong nam trong JWT', () => {
    it('go ADMIN trong CSDL thi CHINH access token do bi 403 ngay request ke tiep', async () => {
      const admin = await adminSession();
      await list(admin.accessToken).expect(200);

      const adminRole = await t.prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
      await t.prisma.userRole.delete({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
      });

      expectForbidden(await list(admin.accessToken).expect(403));
    });

    it('cap ADMIN trong CSDL thi token CUSTOMER dang co duoc vao ngay, khong can dang nhap lai', async () => {
      const customer = await customerSession();
      await list(customer.accessToken).expect(403);

      await expect(grantAdminRole(t.prisma, CUSTOMER_EMAIL)).resolves.toMatchObject({
        outcome: 'GRANTED',
      });

      await list(customer.accessToken).expect(200);
    });

    it('ADMIN bi khoa (LOCKED) thi 401 du van con vai ADMIN', async () => {
      const admin = await adminSession();
      await t.prisma.user.update({ where: { id: admin.id }, data: { status: UserStatus.LOCKED } });

      expectUnauthorized(await list(admin.accessToken).expect(401));
    });
  });

  describe('grantAdminRole (loi cua script admin:grant) tren CSDL that', () => {
    const userRoleCount = (userId: string) => t.prisma.userRole.count({ where: { userId } });

    it('chuan hoa email, idempotent, khong tao ban ghi trung', async () => {
      const session = await flows.activateAndLogin(ADMIN_EMAIL);

      await expect(grantAdminRole(t.prisma, '  QUAN.TRI@Example.TEST ')).resolves.toEqual({
        outcome: 'GRANTED',
        userId: session.id,
      });
      await expect(grantAdminRole(t.prisma, ADMIN_EMAIL)).resolves.toEqual({
        outcome: 'ALREADY_ADMIN',
        userId: session.id,
      });
      expect(await userRoleCount(session.id)).toBe(2);
    });

    it('khong tao user moi khi email khong ton tai', async () => {
      const before = await t.prisma.user.count();

      await expect(grantAdminRole(t.prisma, 'chua.dang.ky@example.test')).resolves.toEqual({
        outcome: 'USER_NOT_FOUND',
      });
      await expect(grantAdminRole(t.prisma, 'khong-co-a-cong')).resolves.toEqual({
        outcome: 'INVALID_EMAIL',
      });
      expect(await t.prisma.user.count()).toBe(before);
    });

    it('tu choi tai khoan chua ACTIVE (chua xac thuc, bi khoa) va khong gan vai', async () => {
      await flows.registerPending(ADMIN_EMAIL);
      const pending = await t.prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });

      await expect(grantAdminRole(t.prisma, ADMIN_EMAIL)).resolves.toEqual({
        outcome: 'USER_NOT_ACTIVE',
      });

      await t.prisma.user.update({
        where: { id: pending.id },
        data: { status: UserStatus.LOCKED },
      });
      await expect(grantAdminRole(t.prisma, ADMIN_EMAIL)).resolves.toEqual({
        outcome: 'USER_NOT_ACTIVE',
      });
      expect(await userRoleCount(pending.id)).toBe(1);
    });
  });
});
