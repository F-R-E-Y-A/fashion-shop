import { seedCatalog } from '../../prisma/seed/catalog.seed.js';
import { seedIdentity } from '../../prisma/seed/identity.seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedTestCatalogProducts } from '../fixtures/catalog-products.js';

/**
 * Xoa sach cac bang test, roi nap taxonomy va san pham fixture.
 * Khong liet ke ten bang cung: ai them bang moi thi ham nay tu bao ca bang do.
 * Chi chay tren CSDL kiem thu (test/setup-env.ts bao dam dieu nay).
 *
 * Giu lai hai bang do MIGRATION nap: `_prisma_migrations` va `roles` (danh muc vai, ADR-018). Xoa
 * `roles` thi khong con gi nap lai no, vi seed khong con ghi vai; giu lai con giup bai test chay dung
 * duong production: vai den tu migration, khong den tu seed.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'roles')
  `;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  await seedCatalog(prisma);
  await Promise.all([seedTestCatalogProducts(prisma), seedIdentity(prisma)]);
}
