import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AdministrativeAreaConflictError,
  type AdministrativeDataset,
  loadAdministrativeDataset,
  seedAdministrativeAreas,
  validateAdministrativeDataset,
} from '../prisma/seed/administrative-areas.seed.js';
import { AdministrativeAreaLevel } from '../src/generated/prisma/client.js';
import { seedTestAdministrativeAreas } from './fixtures/administrative-areas.js';
import { authFlows } from './helpers/auth-flow.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

const dataset = loadAdministrativeDataset();
const clone = (): AdministrativeDataset => structuredClone(dataset);

describe('Tep du lieu khu vuc hanh chinh (Quyet dinh 19/2025/QD-TTg)', () => {
  it('dung so luong, ma, ten, tinh cha va so xa/phuong/dac khu cua tung tinh', () => {
    expect(validateAdministrativeDataset(dataset)).toEqual([]);
    expect(dataset.provinces).toHaveLength(34);
    expect(dataset.communes).toHaveLength(3321);
    expect(new Set([...dataset.provinces, ...dataset.communes].map((a) => a.code)).size).toBe(3355);

    const byType = (prefix: string) =>
      dataset.communes.filter((commune) => commune.name.startsWith(prefix)).length;
    expect([byType('Xã '), byType('Phường '), byType('Đặc khu ')]).toEqual([2621, 687, 13]);
    expect(dataset.source).toMatchObject({ issuedOn: '2025-06-30', effectiveFrom: '2025-07-01' });
  });

  it('mau doi chieu tay voi ban PDF: ma giu so 0 dau, ten giu dau tieng Viet', () => {
    const province = (code: string) => dataset.provinces.find((p) => p.code === code)?.name;
    const commune = (code: string) => dataset.communes.find((c) => c.code === code);
    const inProvince = (code: string) =>
      dataset.communes.filter((c) => c.provinceCode === code).length;

    expect(dataset.provinces.slice(0, 3).map((p) => p.code)).toEqual(['01', '04', '08']);
    expect(
      ['01', '79', '48', '82', '91'].map((code) => [province(code), inProvince(code)]),
    ).toEqual([
      ['Thành phố Hà Nội', 126],
      ['Thành phố Hồ Chí Minh', 168],
      ['Thành phố Đà Nẵng', 94],
      ['Tỉnh Đồng Tháp', 102],
      ['Tỉnh An Giang', 102],
    ]);
    expect(
      [
        '00004',
        '00070',
        '26740',
        '25747',
        '26732',
        '20410',
        '20333',
        '28261',
        '30061',
        '30742',
        '31078',
        '23764',
        '24184',
      ].map((code) => commune(code)),
    ).toEqual([
      { code: '00004', name: 'Phường Ba Đình', provinceCode: '01' },
      { code: '00070', name: 'Phường Hoàn Kiếm', provinceCode: '01' },
      { code: '26740', name: 'Phường Sài Gòn', provinceCode: '79' },
      { code: '25747', name: 'Phường Thủ Dầu Một', provinceCode: '79' },
      { code: '26732', name: 'Đặc khu Côn Đảo', provinceCode: '79' },
      { code: '20410', name: 'Phường Hội An', provinceCode: '48' },
      { code: '20333', name: 'Đặc khu Hoàng Sa', provinceCode: '48' },
      { code: '28261', name: 'Phường Mỹ Tho', provinceCode: '82' },
      { code: '30061', name: 'Xã Đốc Binh Kiều', provinceCode: '82' },
      { code: '30742', name: 'Phường Rạch Giá', provinceCode: '91' },
      { code: '31078', name: 'Đặc khu Phú Quốc', provinceCode: '91' },
      { code: '23764', name: 'Xã Ia Grai', provinceCode: '52' },
      { code: '24184', name: "Xã Ea H'Leo", provinceCode: '66' },
    ]);
  });

  it('bat duoc tep sai: ma trung, ma sai dang, thieu tinh cha, ten thua khoang trang, lech tong', () => {
    const broken = clone();
    broken.communes[1] = { ...broken.communes[1]!, code: broken.communes[0]!.code };
    broken.communes[2] = { ...broken.communes[2]!, code: '123' };
    broken.communes[3] = { ...broken.communes[3]!, provinceCode: '99' };
    broken.communes[4] = { ...broken.communes[4]!, name: 'Xã  Hai Khoảng' };
    broken.provinces[1] = { ...broken.provinces[1]!, xa: broken.provinces[1]!.xa + 1 };

    const problems = validateAdministrativeDataset(broken).join('\n');
    expect(problems).toContain('ma trung');
    expect(problems).toContain('123: ma xa phai 5 chu so');
    expect(problems).toContain('tinh cha 99 khong co');
    expect(problems).toContain('thua khoang trang');
    expect(problems).toContain(`${broken.provinces[1]!.code}: can`);
  });
});

describe('seedAdministrativeAreas tren Postgres kiem thu', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await t.resetRateLimits();
  });

  afterAll(async () => {
    await t.close();
  });

  const snapshot = async () =>
    new Map(
      (await t.prisma.administrativeArea.findMany()).map((area) => [
        area.code,
        `${area.id}|${area.name}|${area.parentId}|${area.isActive}|${area.updatedAt.toISOString()}`,
      ]),
    );

  it('lan dau them du 34 tinh, 3321 xa dung tinh cha; lan sau khong doi gi', async () => {
    expect(await seedAdministrativeAreas(t.prisma)).toEqual({
      provinces: 34,
      communes: 3321,
      inserted: 3355,
      updated: 0,
      unchanged: 0,
      notInDataset: 0,
    });

    const levels = await t.prisma.administrativeArea.groupBy({ by: ['level'], _count: true });
    expect(Object.fromEntries(levels.map((row) => [row.level, row._count]))).toEqual({
      PROVINCE: 34,
      COMMUNE: 3321,
    });
    const [wrongParents] = await t.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM administrative_areas commune
      LEFT JOIN administrative_areas province ON province.id = commune.parent_id
      WHERE commune.level = 'COMMUNE' AND province.level IS DISTINCT FROM 'PROVINCE'
    `;
    expect(Number(wrongParents?.count)).toBe(0);
    const expectedParent = new Map(dataset.communes.map((c) => [c.code, c.provinceCode]));
    const communes = await t.prisma.administrativeArea.findMany({
      where: { level: AdministrativeAreaLevel.COMMUNE },
      select: { code: true, parent: { select: { code: true } } },
    });
    expect(communes.every((c) => c.parent?.code === expectedParent.get(c.code))).toBe(true);

    const before = await snapshot();
    expect(await seedAdministrativeAreas(t.prisma)).toMatchObject({
      inserted: 0,
      updated: 0,
      unchanged: 3355,
    });
    expect(await snapshot()).toEqual(before);
  });

  it('chay lai giu id, giu dia chi va khu vuc ngoai tep, sua lai ten sai, khong mo lai xa da ngung', async () => {
    const testAreas = await seedTestAdministrativeAreas(t.prisma);
    await seedAdministrativeAreas(t.prisma);

    const user = await authFlows(t).activateAndLogin('dia.chi.that@example.test');
    const hoanKiem = await t.prisma.administrativeArea.findUniqueOrThrow({
      where: { code: '00070' },
    });
    const created = await t.http
      .post('/api/users/me/addresses')
      .set({ Authorization: `Bearer ${user.accessToken}` })
      .send({
        recipientName: 'Người Nhận',
        phone: '0901234567',
        administrativeAreaId: hoanKiem.id,
        detailAddress: '1 Tràng Tiền',
      })
      .expect(201);
    expect(created.body.administrativeArea).toMatchObject({
      code: '00070',
      name: 'Phường Hoàn Kiếm',
      province: { code: '01', name: 'Thành phố Hà Nội' },
    });

    await t.prisma.administrativeArea.update({
      where: { code: '00070' },
      data: { name: 'Phường Sai Tên' },
    });
    await t.prisma.administrativeArea.update({
      where: { code: '00004' },
      data: { isActive: false },
    });

    expect(await seedAdministrativeAreas(t.prisma)).toMatchObject({
      inserted: 0,
      updated: 1,
      unchanged: 3354,
      notInDataset: 8,
    });
    const after = await t.prisma.administrativeArea.findUniqueOrThrow({ where: { code: '00070' } });
    expect(after).toMatchObject({ id: hoanKiem.id, name: 'Phường Hoàn Kiếm' });
    expect(
      (await t.prisma.administrativeArea.findUniqueOrThrow({ where: { code: '00004' } })).isActive,
    ).toBe(false);
    expect(
      await t.prisma.address.findUniqueOrThrow({ where: { id: created.body.id } }),
    ).toMatchObject({ administrativeAreaId: hoanKiem.id });
    expect(
      await t.prisma.administrativeArea.count({ where: { code: { startsWith: 'TEST-' } } }),
    ).toBe(8);
    expect(
      await t.prisma.administrativeArea.findUnique({ where: { id: testAreas.communeA1.id } }),
    ).not.toBeNull();
  });

  it('ma da co nhung khac bac hay khac tinh cha: dung, khong ghi dong nao', async () => {
    const hanoi = await t.prisma.administrativeArea.create({
      data: { code: '01', name: 'Thành phố Hà Nội', level: AdministrativeAreaLevel.PROVINCE },
    });
    await t.prisma.administrativeArea.createMany({
      data: [
        // Ma cua mot xa nhung luu nhu tinh.
        { code: '00070', name: 'Phường Hoàn Kiếm', level: AdministrativeAreaLevel.PROVINCE },
        // Phuong Sai Gon (TP HCM) nhung nam duoi Ha Noi.
        {
          code: '26740',
          name: 'Phường Sài Gòn',
          level: AdministrativeAreaLevel.COMMUNE,
          parentId: hanoi.id,
        },
      ],
    });
    const before = await snapshot();

    const error = await seedAdministrativeAreas(t.prisma).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdministrativeAreaConflictError);
    expect((error as AdministrativeAreaConflictError).conflicts).toEqual([
      { code: '00070', expected: 'COMMUNE thuoc 01', actual: 'PROVINCE' },
      { code: '26740', expected: 'COMMUNE thuoc 79', actual: 'COMMUNE thuoc 01' },
    ]);
    expect(await snapshot()).toEqual(before);
  });

  it('API that tra 34 tinh va dung so xa cua tung tinh mau', async () => {
    await seedAdministrativeAreas(t.prisma);

    const provinces = (await t.http.get('/api/administrative-areas').expect(200)).body as {
      id: string;
      code: string;
      name: string;
    }[];
    expect(provinces).toHaveLength(34);
    expect(provinces).toContainEqual(
      expect.objectContaining({ code: '79', name: 'Thành phố Hồ Chí Minh', parentId: null }),
    );

    const communesOf = async (code: string) => {
      const id = provinces.find((p) => p.code === code)!.id;
      return (await t.http.get(`/api/administrative-areas?parentId=${id}`).expect(200)).body as {
        code: string;
        name: string;
        level: string;
        parentId: string;
      }[];
    };
    expect((await communesOf('01')).length).toBe(126);
    expect((await communesOf('79')).length).toBe(168);
    expect((await communesOf('82')).length).toBe(102);
    expect((await communesOf('91')).map((c) => c.name)).toContain('Đặc khu Phú Quốc');
    expect(await communesOf('48')).toContainEqual(
      expect.objectContaining({ code: '20333', name: 'Đặc khu Hoàng Sa', level: 'COMMUNE' }),
    );
  });
});
