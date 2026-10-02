import { AdministrativeAreaLevel, type PrismaClient } from '../../src/generated/prisma/client.js';

/**
 * Khu vuc hanh chinh GIA, CHI cho kiem thu HTTP: ten va ma ghi ro "Kiem Thu"/"TEST" de khong ai nham la
 * du lieu that. Khong nap vao seed hay CSDL thuong: du lieu tinh/xa that chua co nguon duoc xac minh
 * (ND-12). resetDatabase() xoa bang nay giua cac bai, nen moi bai tu goi ham nay.
 *
 * Hinh dang du de kiem moi luat: tinh A co hai xa hoat dong va mot xa ngung; tinh B co mot xa; tinh C da
 * ngung nhung xa cua no con danh dau hoat dong (van khong duoc dung lam dia chi).
 */
export async function seedTestAdministrativeAreas(prisma: PrismaClient) {
  const province = (code: string, name: string, isActive = true) =>
    prisma.administrativeArea.create({
      data: { code, name, level: AdministrativeAreaLevel.PROVINCE, isActive },
    });
  const commune = (code: string, name: string, parentId: string, isActive = true) =>
    prisma.administrativeArea.create({
      data: { code, name, level: AdministrativeAreaLevel.COMMUNE, parentId, isActive },
    });

  const provinceA = await province('TEST-P-A', 'Tinh Kiem Thu A');
  const provinceB = await province('TEST-P-B', 'Tinh Kiem Thu B');
  const provinceC = await province('TEST-P-C', 'Tinh Kiem Thu C', false);

  return {
    provinceA,
    provinceB,
    provinceC,
    communeA1: await commune('TEST-X-A1', 'Xa Kiem Thu A1', provinceA.id),
    communeA2: await commune('TEST-X-A2', 'Xa Kiem Thu A2', provinceA.id),
    communeA3Inactive: await commune('TEST-X-A3', 'Xa Kiem Thu A3', provinceA.id, false),
    communeB1: await commune('TEST-X-B1', 'Xa Kiem Thu B1', provinceB.id),
    communeC1UnderInactive: await commune('TEST-X-C1', 'Xa Kiem Thu C1', provinceC.id),
  };
}

export type TestAreas = Awaited<ReturnType<typeof seedTestAdministrativeAreas>>;
