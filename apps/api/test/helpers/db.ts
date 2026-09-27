import { seedCatalog } from '../../prisma/seed/catalog.seed.js';
import { seedIdentity } from '../../prisma/seed/identity.seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedTestCatalogProducts } from '../fixtures/catalog-products.js';

/**
 * Xoa sach cac bang test (tru bang migration), roi nap taxonomy va san pham fixture.
 * Khong liet ke ten bang cung: ai them bang moi thi ham nay tu bao ca bang do.
 * Chi chay tren CSDL kiem thu (test/setup-env.ts bao dam dieu nay).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length > 0) {
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  await seedCatalog(prisma);
  await Promise.all([seedTestCatalogProducts(prisma), seedIdentity(prisma)]);
}
