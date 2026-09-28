/**
 * Bo du lieu gia dung chung. Chay: npm run db:seed  (prisma db seed -> tsx prisma/seed/index.ts).
 *
 * Moi phan he co mot tep <ten>.seed.ts xuat ham seedXxx(prisma). Ai them bang thi them tep seed
 * cho bang do va goi o day, TRONG CUNG pull request (docs/CONTRIBUTING.md).
 * Ma dinh danh CO DINH va upsert nen chay lai bao nhieu lan cung ra cung mot bo du lieu, khong trung.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedCatalog } from './catalog.seed.js';
import { seedIdentity } from './identity.seed.js';

loadEnv({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Thieu DATABASE_URL. Chep .env.example thanh .env o goc kho ma.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const [catalog, identity] = await Promise.all([seedCatalog(prisma), seedIdentity(prisma)]);
  console.log(
    `Da nap du lieu gia: ${catalog.categories} danh muc, ${catalog.products} san pham, ${catalog.productVariants} phien ban, ${identity.roles} vai tro.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
