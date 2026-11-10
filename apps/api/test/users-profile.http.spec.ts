import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const A_EMAIL = 'ho.so.a@example.test';
const B_EMAIL = 'ho.so.b@example.test';
const PROFILE_KEYS = ['email', 'fullName', 'id', 'phone'];

describe('UC-01.5 Cap nhat thong tin ca nhan: GET/PATCH /api/users/me', () => {
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
  const getMe = (token: string) => t.http.get('/api/users/me').set(bearer(token));
  const patchMe = (token: string, body: unknown) =>
    t.http
      .patch('/api/users/me')
      .set(bearer(token))
      .send(body as object);
  const stored = (id: string) =>
    t.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        email: true,
        fullName: true,
        phone: true,
        status: true,
        authVersion: true,
        avatarUrl: true,
      },
    });

  it('anonymous: GET va PATCH deu 401', async () => {
    await t.http.get('/api/users/me').expect(401);
    await t.http.patch('/api/users/me').send({ fullName: 'Ai Do' }).expect(401);
    await getMe('khong-phai-jwt').expect(401);
  });

  it('GET: 200, chi truong an toan, no-store, tai khoan cu co fullName/phone null', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);

    const response = await getMe(a.accessToken).expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body).sort()).toEqual(PROFILE_KEYS);
    expect(response.body).toEqual({ id: a.id, email: A_EMAIL, fullName: null, phone: null });
    for (const key of ['passwordHash', 'authVersion', 'status', 'roles', 'refreshToken']) {
      expect(response.text).not.toContain(key);
    }
  });

  it('PATCH: sua ho ten va so dien thoai (trim), sua mot phan giu truong con lai, no-store', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);

    const named = await patchMe(a.accessToken, { fullName: '  Nguyễn Văn An  ' }).expect(200);
    expect(named.headers['cache-control']).toBe('no-store');
    expect(named.body).toEqual({
      id: a.id,
      email: A_EMAIL,
      fullName: 'Nguyễn Văn An',
      phone: null,
    });

    const phoned = await patchMe(a.accessToken, { phone: ' 0901234567 ' }).expect(200);
    expect(phoned.body).toMatchObject({ fullName: 'Nguyễn Văn An', phone: '0901234567' });

    await patchMe(a.accessToken, {}).expect(200);
    expect(await stored(a.id)).toMatchObject({ fullName: 'Nguyễn Văn An', phone: '0901234567' });
    expect((await getMe(a.accessToken).expect(200)).body).toMatchObject({ phone: '0901234567' });
  });

  it('ho ten khong hop le: 400, khong ghi gi', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);
    await patchMe(a.accessToken, { fullName: 'Ten Cu' }).expect(200);

    for (const fullName of ['', '   ', 'a'.repeat(101), 'Dong\nMoi', 123, null, ['A']]) {
      const response = await patchMe(a.accessToken, { fullName }).expect(400);
      expect(response.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    }
    expect((await stored(a.id)).fullName).toBe('Ten Cu');
  });

  it('so dien thoai khong hop le (khac 10 chu so bat dau bang 0): 400', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);

    for (const phone of [
      '12345',
      '1901234567',
      '09012345678',
      '+84901234567',
      '090 123 4567',
      'abc',
      null,
    ]) {
      await patchMe(a.accessToken, { phone }).expect(400);
    }
    expect((await stored(a.id)).phone).toBeNull();
  });

  it('khong mass assignment: truong khong duoc phep sua bi 400, CSDL giu nguyen', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);
    const b = await flows.activateAndLogin(B_EMAIL);
    const before = await stored(a.id);

    for (const body of [
      { email: 'moi@example.test' },
      { status: 'LOCKED' },
      { roles: ['ADMIN'] },
      { authVersion: 9 },
      { avatarUrl: 'https://example.test/a.png' },
      { id: b.id },
      { userId: b.id },
      { createdAt: '2020-01-01T00:00:00.000Z' },
      { fullName: 'Hop Le', email: 'moi@example.test' },
    ]) {
      await patchMe(a.accessToken, body).expect(400);
    }
    expect(await stored(a.id)).toEqual(before);
    expect(
      (await t.prisma.userRole.findMany({ where: { userId: a.id }, include: { role: true } })).map(
        ({ role }) => role.code,
      ),
    ).toEqual(['CUSTOMER']);
  });

  it('chi sua chinh minh; so dien thoai khong unique', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);
    const b = await flows.activateAndLogin(B_EMAIL);

    await patchMe(a.accessToken, { fullName: 'Nguoi A', phone: '0911111111' }).expect(200);
    await patchMe(b.accessToken, { phone: '0911111111' }).expect(200);

    expect(await stored(a.id)).toMatchObject({ fullName: 'Nguoi A', phone: '0911111111' });
    expect(await stored(b.id)).toMatchObject({ fullName: null, phone: '0911111111' });
  });

  it('hoi quy: API quan tri van chay va KHONG lo fullName/phone', async () => {
    const a = await flows.activateAndLogin(A_EMAIL);
    await patchMe(a.accessToken, { fullName: 'Nguoi A', phone: '0911111111' }).expect(200);
    await grantAdminRole(t.prisma, A_EMAIL);

    const list = await t.http.get('/api/admin/users').set(bearer(a.accessToken)).expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(Object.keys(list.body.items[0]).sort()).toEqual([
      'createdAt',
      'email',
      'emailVerifiedAt',
      'id',
      'roles',
      'status',
    ]);
    await t.http.get(`/api/admin/users/${a.id}`).set(bearer(a.accessToken)).expect(200);
  });
});
