/**
 * Nap danh muc 34 tinh, 3321 xa (Quyet dinh 19/2025/QD-TTg) vao CSDL dang tro toi, khong nap gi khac.
 * Danh cho moi truong khong chay seed (production); dev va staging da co trong `npm run db:seed`.
 *
 *   npm run areas:import -w apps/api
 *
 * Dung DATABASE_URL hien tai: .env o goc kho ma cho dev; staging/production thi dat bien truoc lenh.
 * Upsert theo ma, khong xoa dong nao; gap khu vuc da co ma khac bac hay khac tinh cha thi dung va khong
 * ghi gi (prisma/seed/administrative-areas.seed.ts). Chay lai an toan.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import {
  AdministrativeAreaConflictError,
  seedAdministrativeAreas,
} from '../prisma/seed/administrative-areas.seed.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

/** host:port/ten-csdl, bo user va mat khau, de nguoi chay thay minh dang tro vao dau. */
function describeTarget(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thieu DATABASE_URL');

  console.log(`CSDL dich: ${describeTarget(connectionString)}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await seedAdministrativeAreas(prisma);
    console.log(
      `Xong: ${result.provinces} tinh, ${result.communes} xa; them ${result.inserted}, doi ten ` +
        `${result.updated}, giu nguyen ${result.unchanged}; ${result.notInDataset} dong khac khong dong toi.`,
    );
  } catch (error) {
    if (error instanceof AdministrativeAreaConflictError) {
      for (const conflict of error.conflicts) {
        console.error(
          `XUNG DOT ${conflict.code}: can ${conflict.expected}, dang ${conflict.actual}`,
        );
      }
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Chi in thong diep, khong in ca doi tuong loi: loi ket noi cua pg co the chua chuoi ket noi.
  console.error(error instanceof Error ? error.message : 'Loi khong xac dinh');
  process.exitCode = 1;
});
