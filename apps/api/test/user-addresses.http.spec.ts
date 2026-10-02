import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedTestAdministrativeAreas, type TestAreas } from './fixtures/administrative-areas.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const A_EMAIL = 'so.dia.chi.a@example.test';
const B_EMAIL = 'so.dia.chi.b@example.test';
const ADDRESS_KEYS = [
  'administrativeArea',
  'administrativeAreaId',
  'createdAt',
  'detailAddress',
  'id',
  'isDefault',
  'phone',
  'postalCode',
  'recipientName',
  'updatedAt',
];

describe('UC-01.6 Quan ly dia chi giao hang: /api/users/me/addresses va /api/administrative-areas', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;
  let areas: TestAreas;

  beforeAll(async () => {
    t = await createTestApp();
    flows = authFlows(t);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    areas = await seedTestAdministrativeAreas(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string) => t.http.get('/api/users/me/addresses').set(bearer(token));
  const create = (token: string, body: object) =>
    t.http.post('/api/users/me/addresses').set(bearer(token)).send(body);
  const patch = (token: string, id: string, body: object) =>
    t.http.patch(`/api/users/me/addresses/${id}`).set(bearer(token)).send(body);
  const remove = (token: string, id: string) =>
    t.http.delete(`/api/users/me/addresses/${id}`).set(bearer(token));

  const validAddress = (overrides: object = {}) => ({
    recipientName: 'Người Nhận',
    phone: '0901234567',
    administrativeAreaId: areas.communeA1.id,
    detailAddress: '12 Đường Kiểm Thử',
    ...overrides,
  });
  const addressesOf = (userId: string) =>
    t.prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const defaultIds = async (userId: string) =>
    (await addressesOf(userId)).filter((row) => row.isDefault).map((row) => row.id);

  describe('GET /api/administrative-areas (cong khai, chi ban ghi hoat dong)', () => {
    const keys = ['code', 'id', 'level', 'name', 'parentId'];

    it('khong parentId: chi cac tinh dang hoat dong, xep theo ten', async () => {
      const response = await t.http.get('/api/administrative-areas').expect(200);

      expect(response.body.map((area: { code: string }) => area.code)).toEqual([
        'TEST-P-A',
        'TEST-P-B',
      ]);
      for (const area of response.body) expect(Object.keys(area).sort()).toEqual(keys);
      expect(response.body[0]).toMatchObject({ level: 'PROVINCE', parentId: null });
    });

    it('parentId la tinh: chi xa dang hoat dong cua tinh do', async () => {
      const response = await t.http
        .get(`/api/administrative-areas?parentId=${areas.provinceA.id}`)
        .expect(200);

      expect(response.body.map((area: { code: string }) => area.code)).toEqual([
        'TEST-X-A1',
        'TEST-X-A2',
      ]);
      expect(response.body[0]).toMatchObject({ level: 'COMMUNE', parentId: areas.provinceA.id });
    });

    it('tinh da ngung, id la xa, id khong ton tai: mang rong; parentId sai dang: 400', async () => {
      for (const parentId of [areas.provinceC.id, areas.communeA1.id, randomUUID()]) {
        expect(
          (await t.http.get(`/api/administrative-areas?parentId=${parentId}`).expect(200)).body,
        ).toEqual([]);
      }
      await t.http.get('/api/administrative-areas?parentId=abc').expect(400);
      await t.http.get('/api/administrative-areas?level=PROVINCE').expect(400);
    });
  });

  describe('xac thuc', () => {
    it('anonymous: list, create, patch, delete deu 401', async () => {
      const id = randomUUID();
      await t.http.get('/api/users/me/addresses').expect(401);
      await t.http.post('/api/users/me/addresses').send(validAddress()).expect(401);
      await t.http.patch(`/api/users/me/addresses/${id}`).send({}).expect(401);
      await t.http.delete(`/api/users/me/addresses/${id}`).expect(401);
    });
  });

  describe('tao va liet ke', () => {
    it('dia chi dau tien tu thanh mac dinh (ke ca khi gui isDefault=false); dang an toan; no-store', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);

      const response = await create(a.accessToken, validAddress({ isDefault: false })).expect(201);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body).sort()).toEqual(ADDRESS_KEYS);
      expect(response.body).toMatchObject({
        isDefault: true,
        postalCode: null,
        administrativeAreaId: areas.communeA1.id,
        administrativeArea: {
          id: areas.communeA1.id,
          code: 'TEST-X-A1',
          name: 'Xa Kiem Thu A1',
          province: { id: areas.provinceA.id, code: 'TEST-P-A', name: 'Tinh Kiem Thu A' },
        },
      });
      expect(response.text).not.toContain('userId');
      expect(response.text).not.toContain(a.id);
    });

    it('dia chi thu hai khong mac dinh; thu ba isDefault=true thi chuyen mac dinh', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const first = (await create(a.accessToken, validAddress()).expect(201)).body;
      const second = (
        await create(a.accessToken, validAddress({ recipientName: 'Hai' })).expect(201)
      ).body;
      expect(second.isDefault).toBe(false);
      expect(await defaultIds(a.id)).toEqual([first.id]);

      const third = (
        await create(a.accessToken, validAddress({ recipientName: 'Ba', isDefault: true })).expect(
          201,
        )
      ).body;

      expect(third.isDefault).toBe(true);
      expect(await defaultIds(a.id)).toEqual([third.id]);
    });

    it('list chi thay dia chi cua minh, mac dinh truoc roi cu truoc moi, no-store', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const b = await flows.activateAndLogin(B_EMAIL);
      const first = (await create(a.accessToken, validAddress()).expect(201)).body;
      const second = (
        await create(a.accessToken, validAddress({ recipientName: 'Hai', isDefault: true })).expect(
          201,
        )
      ).body;
      await create(b.accessToken, validAddress({ recipientName: 'Cua B' })).expect(201);

      const response = await list(a.accessToken).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
      expect(response.text).not.toContain('Cua B');
      expect((await list(b.accessToken).expect(200)).body).toHaveLength(1);
    });

    it('postalCode tuy chon, co trim; thieu truong bat buoc hay du lieu sai: 400', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const withPostal = await create(
        a.accessToken,
        validAddress({ postalCode: ' 700000 ' }),
      ).expect(201);
      expect(withPostal.body.postalCode).toBe('700000');

      for (const body of [
        {},
        validAddress({ recipientName: '  ' }),
        validAddress({ recipientName: undefined }),
        validAddress({ phone: '12345' }),
        validAddress({ detailAddress: '' }),
        validAddress({ detailAddress: 'x'.repeat(256) }),
        validAddress({ postalCode: 'khong hop le!!' }),
        validAddress({ administrativeAreaId: 'abc' }),
        validAddress({ isDefault: 'true' }),
      ]) {
        await create(a.accessToken, body).expect(400);
      }
      expect(await addressesOf(a.id)).toHaveLength(1);
    });

    it('khong mass assignment: userId, id, createdAt bi 400, khong tao gi', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const b = await flows.activateAndLogin(B_EMAIL);

      for (const extra of [
        { userId: b.id },
        { id: randomUUID() },
        { createdAt: '2020-01-01T00:00:00.000Z' },
        { user: { connect: { id: b.id } } },
      ]) {
        await create(a.accessToken, validAddress(extra)).expect(400);
      }
      expect(await t.prisma.address.count()).toBe(0);
    });
  });

  describe('khu vuc hanh chinh khong hop le: 422, khong ghi gi', () => {
    it('tao: tinh, xa ngung, xa thuoc tinh ngung, id khong ton tai', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);

      for (const administrativeAreaId of [
        areas.provinceA.id,
        areas.communeA3Inactive.id,
        areas.communeC1UnderInactive.id,
        randomUUID(),
      ]) {
        const response = await create(a.accessToken, validAddress({ administrativeAreaId })).expect(
          422,
        );
        expect(response.body).toMatchObject({
          statusCode: 422,
          code: 'INVALID_ADMINISTRATIVE_AREA',
        });
      }
      expect(await t.prisma.address.count()).toBe(0);
    });

    it('sua: doi sang id tinh thi 422 va dia chi giu nguyen', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const address = (await create(a.accessToken, validAddress()).expect(201)).body;

      await patch(a.accessToken, address.id, {
        administrativeAreaId: areas.provinceB.id,
        recipientName: 'Khong Duoc Luu',
      }).expect(422);

      expect((await addressesOf(a.id))[0]).toMatchObject({
        administrativeAreaId: areas.communeA1.id,
        recipientName: 'Người Nhận',
      });
    });
  });

  describe('sua', () => {
    it('sua mot phan dia chi cua minh; postalCode null thi xoa; gui null cho truong bat buoc thi 400', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const address = (
        await create(a.accessToken, validAddress({ postalCode: '700000' })).expect(201)
      ).body;

      const updated = await patch(a.accessToken, address.id, {
        recipientName: '  Tên Mới ',
        administrativeAreaId: areas.communeB1.id,
      }).expect(200);
      expect(updated.headers['cache-control']).toBe('no-store');
      expect(updated.body).toMatchObject({
        recipientName: 'Tên Mới',
        phone: '0901234567',
        postalCode: '700000',
        administrativeArea: { id: areas.communeB1.id, province: { id: areas.provinceB.id } },
      });

      expect(
        (await patch(a.accessToken, address.id, { postalCode: null }).expect(200)).body.postalCode,
      ).toBeNull();
      for (const body of [
        { recipientName: null },
        { phone: null },
        { isDefault: null },
        { userId: randomUUID() },
      ]) {
        await patch(a.accessToken, address.id, body).expect(400);
      }
      expect((await patch(a.accessToken, address.id, {}).expect(200)).body.recipientName).toBe(
        'Tên Mới',
      );
    });

    it('isDefault=true doi mac dinh; isDefault=false tren mac dinh hien tai: 409 va khong doi gi', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const first = (await create(a.accessToken, validAddress()).expect(201)).body;
      const second = (
        await create(a.accessToken, validAddress({ recipientName: 'Hai' })).expect(201)
      ).body;

      await patch(a.accessToken, second.id, { isDefault: true }).expect(200);
      expect(await defaultIds(a.id)).toEqual([second.id]);

      const conflict = await patch(a.accessToken, second.id, {
        isDefault: false,
        recipientName: 'Khong Duoc Luu',
      }).expect(409);
      expect(conflict.body).toMatchObject({ statusCode: 409, code: 'DEFAULT_ADDRESS_REQUIRED' });
      expect(await defaultIds(a.id)).toEqual([second.id]);
      expect((await addressesOf(a.id))[1]?.recipientName).toBe('Hai');

      await patch(a.accessToken, first.id, { isDefault: false }).expect(200);
      await patch(a.accessToken, second.id, { isDefault: true }).expect(200);
      expect(await defaultIds(a.id)).toEqual([second.id]);
    });
  });

  describe('xoa', () => {
    it('xoa dia chi khong mac dinh: 204, mac dinh giu nguyen', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const first = (await create(a.accessToken, validAddress()).expect(201)).body;
      const second = (
        await create(a.accessToken, validAddress({ recipientName: 'Hai' })).expect(201)
      ).body;

      await remove(a.accessToken, second.id).expect(204);

      expect(await defaultIds(a.id)).toEqual([first.id]);
      expect(await addressesOf(a.id)).toHaveLength(1);
    });

    it('xoa mac dinh con dia chi khac: dia chi cu nhat thanh mac dinh, trung thoi diem thi id nho hon', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const current = (await create(a.accessToken, validAddress()).expect(201)).body;
      const x = (await create(a.accessToken, validAddress({ recipientName: 'X' })).expect(201))
        .body;
      const y = (await create(a.accessToken, validAddress({ recipientName: 'Y' })).expect(201))
        .body;
      // X va Y cung thoi diem tao (cu hon dia chi mac dinh): luat pha hoa la id tang dan.
      const tie = new Date('2026-01-01T00:00:00.000Z');
      await t.prisma.address.updateMany({
        where: { id: { in: [x.id, y.id] } },
        data: { createdAt: tie },
      });

      await remove(a.accessToken, current.id).expect(204);

      expect(await defaultIds(a.id)).toEqual([[x.id, y.id].sort()[0]]);
    });

    it('xoa dia chi cuoi cung: khong con dia chi, khong con mac dinh', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const only = (await create(a.accessToken, validAddress()).expect(201)).body;

      await remove(a.accessToken, only.id).expect(204);

      expect(await addressesOf(a.id)).toEqual([]);
      expect((await list(a.accessToken).expect(200)).body).toEqual([]);
      expect((await create(a.accessToken, validAddress()).expect(201)).body.isDefault).toBe(true);
    });
  });

  describe('quyen so huu (IDOR): dia chi cua nguoi khac giong het dia chi khong ton tai', () => {
    it('PATCH va DELETE dia chi cua B tu A: 404, cung than loi voi id khong ton tai; dia chi B nguyen ven', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      const b = await flows.activateAndLogin(B_EMAIL);
      const foreign = (
        await create(b.accessToken, validAddress({ recipientName: 'Cua B' })).expect(201)
      ).body;
      const unknown = randomUUID();
      const strip = (body: Record<string, unknown>) => ({
        ...body,
        path: undefined,
        timestamp: undefined,
      });

      const foreignPatch = await patch(a.accessToken, foreign.id, {
        recipientName: 'Chiem',
      }).expect(404);
      const unknownPatch = await patch(a.accessToken, unknown, { recipientName: 'Chiem' }).expect(
        404,
      );
      expect(strip(foreignPatch.body)).toEqual(strip(unknownPatch.body));

      const foreignDelete = await remove(a.accessToken, foreign.id).expect(404);
      const unknownDelete = await remove(a.accessToken, unknown).expect(404);
      expect(strip(foreignDelete.body)).toEqual(strip(unknownDelete.body));

      await patch(a.accessToken, foreign.id, { isDefault: true }).expect(404);
      expect((await addressesOf(b.id))[0]).toMatchObject({
        recipientName: 'Cua B',
        isDefault: true,
      });
    });

    it('id sai dang: 400 cho PATCH va DELETE', async () => {
      const a = await flows.activateAndLogin(A_EMAIL);
      await patch(a.accessToken, 'abc', { recipientName: 'X' }).expect(400);
      await remove(a.accessToken, 'abc').expect(400);
    });
  });
});
