import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { UserStatus } from '../src/generated/prisma/client.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';
import { RoleCode } from '../src/modules/auth/role-code.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const ADMIN_EMAIL = 'quan.tri.loc@example.test';
const CUSTOMER_EMAIL = 'khach.loc@example.test';
const SAFE_KEYS = ['createdAt', 'email', 'emailVerifiedAt', 'id', 'roles', 'status'];

interface Item {
  id: string;
  email: string;
  status: string;
  roles: string[];
  emailVerifiedAt: string | null;
  createdAt: string;
}

/** Du lieu tong hop; createdAt co dinh de thu tu sap xep kiem duoc. Tat ca deu cu hon admin. */
interface Fixture {
  email: string;
  status?: UserStatus;
  verified?: boolean;
  roles?: RoleCode[];
  day: number;
  id?: string;
}

describe('UC-02.1 Quan tri tai khoan, Issue #48: tim, loc, sap xep GET /api/admin/users', () => {
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

  const list = (token: string | undefined, query = '') => {
    const request = t.http.get(`/api/admin/users${query}`);
    return token ? request.set({ Authorization: `Bearer ${token}` }) : request;
  };

  async function adminSession() {
    const session = await flows.activateAndLogin(ADMIN_EMAIL);
    expect((await grantAdminRole(t.prisma, ADMIN_EMAIL)).outcome).toBe('GRANTED');
    return session;
  }

  async function seed(fixtures: Fixture[]) {
    const roles = await t.prisma.role.findMany({ select: { id: true, code: true } });
    const roleId = (code: RoleCode) => roles.find((role) => role.code === code)!.id;
    for (const fixture of fixtures) {
      await t.prisma.user.create({
        data: {
          ...(fixture.id ? { id: fixture.id } : {}),
          email: fixture.email,
          passwordHash: 'khong-dung-de-dang-nhap',
          status: fixture.status ?? UserStatus.ACTIVE,
          emailVerifiedAt:
            fixture.verified === false ? null : new Date(Date.UTC(2025, 0, fixture.day, 1)),
          createdAt: new Date(Date.UTC(2025, 0, fixture.day)),
          userRoles: {
            create: (fixture.roles ?? [RoleCode.CUSTOMER]).map((code) => ({
              roleId: roleId(code),
            })),
          },
        },
      });
    }
  }

  const emails = (body: { items: Item[] }) => body.items.map((item) => item.email);

  describe('quyen chay truoc kiem tham so', () => {
    it('UC-02.1/AC11 khach 401, CUSTOMER 403, ke ca khi tham so loc sai', async () => {
      const customer = await flows.activateAndLogin(CUSTOMER_EMAIL);
      for (const query of ['?q=a', '?status=nope', '?verified=yes&sort=x']) {
        expect((await list(undefined, query).expect(401)).body).toMatchObject({
          code: 'UNAUTHORIZED',
        });
        expect((await list(customer.accessToken, query).expect(403)).body).toMatchObject({
          code: 'FORBIDDEN',
        });
      }
    });
  });

  describe('q: tim email tren toan bo du lieu', () => {
    it('UC-02.1/AC11 khop ca dong o ngoai trang dau; total theo bo loc, khong tinh tu items', async () => {
      const admin = await adminSession();
      await seed([
        { email: 'can.tim.cu.nhat@example.test', day: 1 },
        ...Array.from({ length: 14 }, (_, i) => ({
          email: `nhieu.${i}@example.test`,
          day: 10 + i,
        })),
        { email: 'CAN.TIM.moi@example.test', day: 30 },
      ]);

      const all = await list(admin.accessToken, '?pageSize=12').expect(200);
      expect(all.body.total).toBe(17);
      expect(emails(all.body)).not.toContain('can.tim.cu.nhat@example.test');

      const found = await list(admin.accessToken, '?q=%20%20can.TIM%20&pageSize=12').expect(200);
      expect(found.body).toMatchObject({ total: 2, page: 1, pageSize: 12, totalPages: 1 });
      expect(emails(found.body)).toEqual([
        'CAN.TIM.moi@example.test',
        'can.tim.cu.nhat@example.test',
      ]);
      for (const item of found.body.items as Item[])
        expect(Object.keys(item).sort()).toEqual(SAFE_KEYS);

      const paged = await list(admin.accessToken, '?q=nhieu.&pageSize=5&page=3').expect(200);
      expect(paged.body).toMatchObject({ total: 14, page: 3, pageSize: 5, totalPages: 3 });
      expect(paged.body.items).toHaveLength(4);

      const blank = await list(admin.accessToken, '?q=%20%20%20').expect(200);
      expect(blank.body.total).toBe(17);
    });

    it('UC-02.1/AC11 %, _, dau nhay va \\ la ky tu thuong, khong phai wildcard hay SQL', async () => {
      const admin = await adminSession();
      await seed([
        { email: 'phan%tram@example.test', day: 1 },
        { email: 'gach_duoi@example.test', day: 2 },
        { email: 'gachxduoi@example.test', day: 3 },
        { email: "o'neil@example.test", day: 4 },
        { email: 'xuyet\\nguoc@example.test', day: 5 },
        { email: 'binh.thuong@example.test', day: 6 },
      ]);
      const search = async (q: string) =>
        emails((await list(admin.accessToken, `?q=${encodeURIComponent(q)}`).expect(200)).body);

      expect(await search('%')).toEqual(['phan%tram@example.test']);
      expect(await search('_')).toEqual(['gach_duoi@example.test']);
      expect(await search('gach_d')).toEqual(['gach_duoi@example.test']);
      expect(await search("'")).toEqual(["o'neil@example.test"]);
      expect(await search("' OR '1'='1")).toEqual([]);
      expect(await search('\\')).toEqual(['xuyet\\nguoc@example.test']);
      expect(await search('%_%')).toEqual([]);
    });
  });

  describe('loc trang thai, vai, xac thuc; ket hop AND', () => {
    async function fixture() {
      const admin = await adminSession();
      await seed([
        { email: 'hoat.dong@example.test', day: 1 },
        { email: 'bi.khoa@example.test', status: UserStatus.LOCKED, day: 2 },
        {
          email: 'cho.xac.thuc@example.test',
          status: UserStatus.PENDING_VERIFICATION,
          verified: false,
          day: 3,
        },
        { email: 'vo.hieu@example.test', status: UserStatus.DISABLED, day: 4 },
        { email: 'hai.vai@example.test', roles: [RoleCode.ADMIN, RoleCode.CUSTOMER], day: 5 },
        { email: 'hoat.dong.chua.xac.thuc@example.test', verified: false, day: 6 },
        {
          email: 'khoa.chua.xac.thuc@example.test',
          status: UserStatus.LOCKED,
          verified: false,
          day: 7,
        },
      ]);
      return admin;
    }

    it('UC-02.1/AC11 status chinh xac tung gia tri', async () => {
      const admin = await fixture();
      const status = async (value: string) =>
        (await list(admin.accessToken, `?status=${value}`).expect(200)).body;

      expect(emails(await status('LOCKED'))).toEqual([
        'khoa.chua.xac.thuc@example.test',
        'bi.khoa@example.test',
      ]);
      expect(emails(await status('PENDING_VERIFICATION'))).toEqual(['cho.xac.thuc@example.test']);
      expect(emails(await status('DISABLED'))).toEqual(['vo.hieu@example.test']);
      expect((await status('ACTIVE')).total).toBe(4); // admin + 3 ACTIVE
    });

    it('UC-02.1/AC11 role la membership: tai khoan nhieu vai khop moi vai cua no', async () => {
      const admin = await fixture();
      const adminRole = (await list(admin.accessToken, '?role=ADMIN').expect(200)).body;
      expect(emails(adminRole)).toEqual([ADMIN_EMAIL, 'hai.vai@example.test']);
      const customerRole = (await list(admin.accessToken, '?role=CUSTOMER').expect(200)).body;
      expect(emails(customerRole)).toContain('hai.vai@example.test');
      expect(customerRole.total).toBe(8); // admin tu dang ky cung co CUSTOMER
    });

    it('UC-02.1/AC11 verified=false la emailVerifiedAt null, khong suy tu status; verified=true nguoc lai', async () => {
      const admin = await fixture();
      const unverified = (await list(admin.accessToken, '?verified=false').expect(200)).body;
      expect(emails(unverified)).toEqual([
        'khoa.chua.xac.thuc@example.test',
        'hoat.dong.chua.xac.thuc@example.test',
        'cho.xac.thuc@example.test',
      ]);
      for (const item of unverified.items as Item[]) expect(item.emailVerifiedAt).toBeNull();
      const verified = (await list(admin.accessToken, '?verified=true').expect(200)).body;
      expect(verified.total).toBe(5);
      for (const item of verified.items as Item[]) expect(item.emailVerifiedAt).not.toBeNull();
    });

    it('UC-02.1/AC11 cac bo loc ket hop AND; total va totalPages theo dung tap da loc', async () => {
      const admin = await fixture();
      const both = (
        await list(admin.accessToken, '?status=LOCKED&verified=false&role=CUSTOMER&q=khoa').expect(
          200,
        )
      ).body;
      expect(both).toMatchObject({ total: 1, totalPages: 1 });
      expect(emails(both)).toEqual(['khoa.chua.xac.thuc@example.test']);

      const none = (await list(admin.accessToken, '?status=DISABLED&role=ADMIN').expect(200)).body;
      expect(none).toMatchObject({ items: [], total: 0, totalPages: 1 });

      const paged = (await list(admin.accessToken, '?status=ACTIVE&pageSize=3&page=2').expect(200))
        .body;
      expect(paged).toMatchObject({ total: 4, page: 2, pageSize: 3, totalPages: 2 });
      expect(paged.items).toHaveLength(1);
    });
  });

  describe('sap xep', () => {
    it('UC-02.1/AC11 newest, oldest, email_asc, email_desc; trung createdAt thi xep theo id tang', async () => {
      const admin = await adminSession();
      await seed([
        { email: 'b.trung.ngay@example.test', day: 5, id: '00000000-0000-4000-8000-0000000000b2' },
        { email: 'a.trung.ngay@example.test', day: 5, id: '00000000-0000-4000-8000-0000000000b1' },
        { email: 'c.cu@example.test', day: 1 },
        { email: 'd.moi@example.test', day: 9 },
      ]);
      const sorted = async (sort: string) =>
        emails((await list(admin.accessToken, `?q=example.test&sort=${sort}`).expect(200)).body);

      expect(await sorted('newest')).toEqual([
        ADMIN_EMAIL,
        'd.moi@example.test',
        'a.trung.ngay@example.test',
        'b.trung.ngay@example.test',
        'c.cu@example.test',
      ]);
      expect(await sorted('oldest')).toEqual([
        'c.cu@example.test',
        'a.trung.ngay@example.test',
        'b.trung.ngay@example.test',
        'd.moi@example.test',
        ADMIN_EMAIL,
      ]);
      expect(await sorted('email_asc')).toEqual([
        'a.trung.ngay@example.test',
        'b.trung.ngay@example.test',
        'c.cu@example.test',
        'd.moi@example.test',
        ADMIN_EMAIL,
      ]);
      expect(await sorted('email_desc')).toEqual([...(await sorted('email_asc'))].reverse());
      // Khong co sort giu mac dinh cu: moi nhat truoc.
      expect(emails((await list(admin.accessToken, '?q=example.test').expect(200)).body)).toEqual(
        await sorted('newest'),
      );
    });
  });

  describe('tham so sai dang tra 400', () => {
    it('UC-02.1/AC11 gia tri ngoai hop dong, lap tham so, q qua dai, tham so la', async () => {
      const admin = await adminSession();
      const tooLong = 'a'.repeat(255);
      for (const query of [
        '?status=active',
        '?status=STAFF',
        '?status=ACTIVE&status=LOCKED',
        '?role=STAFF',
        '?role=admin',
        '?verified=yes',
        '?verified=1',
        '?verified=',
        '?verified=true&verified=false',
        '?sort=email',
        '?sort=newest&sort=oldest',
        '?q=a&q=b',
        `?q=${tooLong}`,
        '?search=a',
        '?pageSize=61',
      ]) {
        const response = await list(admin.accessToken, query);
        expect(response.status, query).toBe(400);
        expect(response.body).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
      }
      // 254 ky tu van hop le (sau trim).
      await list(admin.accessToken, `?q=%20${'a'.repeat(254)}%20`).expect(200);
    });
  });
});
