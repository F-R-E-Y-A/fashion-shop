import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedTestAdministrativeAreas, type TestAreas } from './fixtures/administrative-areas.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const EMAIL = 'dong.thoi@example.test';
const ROUNDS = 5;

/**
 * Bat bien cua so dia chi duoi tai song song: co dia chi thi co DUNG mot mac dinh, khong con dia chi thi
 * khong co mac dinh; khong yeu cau nao 500 (loi chi muc duy nhat cua Prisma khong bao gio lot ra API).
 */
describe('UC-01.6 So dia chi duoi yeu cau dong thoi (moi bai lap 5 vong)', () => {
  let t: TestApp;
  let flows: ReturnType<typeof authFlows>;
  let areas: TestAreas;
  let user: { id: string; accessToken: string };

  beforeAll(async () => {
    t = await createTestApp();
    flows = authFlows(t);
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
    areas = await seedTestAdministrativeAreas(t.prisma);
    user = await flows.activateAndLogin(EMAIL);
  });

  afterAll(async () => {
    await t.close();
  });

  const bearer = () => ({ Authorization: `Bearer ${user.accessToken}` });
  const body = (recipientName: string, isDefault?: boolean) => ({
    recipientName,
    phone: '0901234567',
    administrativeAreaId: areas.communeA1.id,
    detailAddress: '1 Duong Dong Thoi',
    ...(isDefault === undefined ? {} : { isDefault }),
  });
  const create = (name: string, isDefault?: boolean) =>
    t.http.post('/api/users/me/addresses').set(bearer()).send(body(name, isDefault));
  const setDefault = (id: string) =>
    t.http.patch(`/api/users/me/addresses/${id}`).set(bearer()).send({ isDefault: true });
  const remove = (id: string) => t.http.delete(`/api/users/me/addresses/${id}`).set(bearer());

  async function expectInvariant(): Promise<void> {
    const rows = await t.prisma.address.findMany({ where: { userId: user.id } });
    const defaults = rows.filter((row) => row.isDefault).length;
    expect(defaults).toBe(rows.length === 0 ? 0 : 1);
  }

  function expectNo500(responses: Array<{ status: number }>): void {
    for (const response of responses) expect(response.status).toBeLessThan(500);
  }

  it('A. hai PATCH dat hai dia chi khac nhau lam mac dinh cung luc', async () => {
    const ids: string[] = [];
    for (const name of ['Mot', 'Hai', 'Ba']) ids.push((await create(name).expect(201)).body.id);

    for (let round = 0; round < ROUNDS; round += 1) {
      const responses = await Promise.all([setDefault(ids[1]!), setDefault(ids[2]!)]);
      expectNo500(responses);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      await expectInvariant();
      await setDefault(ids[0]!).expect(200);
    }
  });

  it('B. POST isDefault=true cung luc voi PATCH isDefault=true', async () => {
    const first = (await create('Mot').expect(201)).body.id as string;
    const other = (await create('Hai').expect(201)).body.id as string;

    for (let round = 0; round < ROUNDS; round += 1) {
      const responses = await Promise.all([create(`Moi ${round}`, true), setDefault(other)]);
      expectNo500(responses);
      expect(responses.map((response) => response.status)).toEqual([201, 200]);
      await expectInvariant();
      await setDefault(first).expect(200);
    }
  });

  it('C. hai POST dia chi DAU TIEN cung luc: chi mot cai thanh mac dinh', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const responses = await Promise.all([create('Mot'), create('Hai')]);
      expectNo500(responses);
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
      expect(responses.filter((response) => response.body.isDefault === true)).toHaveLength(1);
      await expectInvariant();
      await t.prisma.address.deleteMany({ where: { userId: user.id } });
    }
  });

  it('D. xoa dia chi mac dinh cung luc voi dat mot dia chi khac lam mac dinh', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const current = (await create('Mac Dinh').expect(201)).body.id as string;
      // X la ung vien duoc tu dong len mac dinh neu phep xoa chay truoc phep dat Y.
      await create('X').expect(201);
      const y = (await create('Y').expect(201)).body.id as string;

      const responses = await Promise.all([remove(current), setDefault(y)]);
      expectNo500(responses);
      expect(responses.map((response) => response.status)).toEqual([204, 200]);
      await expectInvariant();
      await t.prisma.address.deleteMany({ where: { userId: user.id } });
    }
  });

  it('E. xoa het dia chi cung luc: khong 500, ket thuc khong con mac dinh', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const ids = [
        (await create('Mot').expect(201)).body.id as string,
        (await create('Hai').expect(201)).body.id as string,
      ];

      const responses = await Promise.all(ids.map((id) => remove(id)));
      expectNo500(responses);
      expect(responses.map((response) => response.status)).toEqual([204, 204]);
      await expectInvariant();
    }
  });
});
