/**
 * Dat ton vat ly theo file kiem ke CSV `sku,quantity`. Tat ca hoac khong dong nao duoc ghi.
 *
 *   npm run stock:import -w apps/api -- --file=<duong-dan.csv> [--dry-run]
 *
 * Dung DATABASE_URL hien tai (.env o goc cho dev; staging/production dat bien truoc lenh). So lieu do
 * chu kho cung cap; script khong tu sinh ton tu du lieu crawl. Moi chenh lech ghi StockMovement
 * ADJUSTMENT. Tu choi so nho hon luong dang giu cho don cho thanh toan. Chay lai cung file: khong doi.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { prismaConnection } from '../src/infra/prisma/connection.js';
import { applyStockCounts, parseStockCsv } from '../src/modules/inventory/index.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

function parseArgs(args: string[]): { file: string; dryRun: boolean } {
  let file: string | undefined;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg.startsWith('--file=')) file = arg.slice('--file='.length);
    else if (arg === '--file') file = args[++index];
    else if (arg === '--dry-run') dryRun = true;
    else throw new Error(`Tham so khong ho tro: ${arg}`);
  }
  if (!file) throw new Error('Thieu --file=<duong-dan.csv>');
  return { file, dryRun };
}

/** host:port/ten-csdl, bo user va mat khau, de nguoi chay thay minh dang tro vao dau. */
function describeTarget(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function main(): Promise<void> {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thieu DATABASE_URL');

  const parsed = parseStockCsv(await readFile(resolve(process.cwd(), file), 'utf8'));
  if (parsed.errors.length) {
    parsed.errors.forEach((error) => console.error(error));
    process.exitCode = 1;
    return;
  }

  console.log(`CSDL dich: ${describeTarget(connectionString)}${dryRun ? ' (dry-run)' : ''}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaConnection(connectionString)) });
  try {
    const result = await applyStockCounts(prisma, parsed.counts, { dryRun });
    if (result.outcome === 'REJECTED') {
      result.errors.forEach((error) => console.error(error));
      console.error('REJECTED: khong ghi dong nao.');
      process.exitCode = 1;
      return;
    }
    const changed = result.changes.filter((change) => change.before !== change.after);
    for (const change of changed)
      console.log(`${change.sku}: ${change.before ?? 'chua co'} -> ${change.after}`);
    console.log(
      `${result.outcome}: ${result.changes.length} SKU, ${changed.length} thay doi, ` +
        `${result.changes.length - changed.length} giu nguyen.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Chi in thong diep, khong in ca doi tuong loi: loi ket noi cua pg co the chua chuoi ket noi.
  console.error(error instanceof Error ? error.message : 'Loi khong xac dinh');
  process.exitCode = 1;
});
