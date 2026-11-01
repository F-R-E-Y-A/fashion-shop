/**
 * Nang mot tai khoan DA CO va dang ACTIVE len ADMIN. Khong tao user, khong nhan mat khau.
 *
 *   npm run admin:grant -w apps/api -- --email=<email>
 *
 * Dung DATABASE_URL hien tai: .env o goc kho ma cho dev; staging/production thi dat bien truoc lenh
 * (dotenv khong ghi de bien da co). In ra CSDL dich (khong co thong tin dang nhap) va id nguoi dung,
 * khong in email, mat khau hay token. Chay lai an toan: lan sau chi bao ALREADY_ADMIN.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { prismaConnection } from '../src/infra/prisma/connection.js';
import { grantAdminRole } from '../src/modules/auth/grant-admin-role.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
loadEnv({ path: resolve(repositoryRoot, '.env'), quiet: true });

const FAILURE_HINTS: Record<string, string> = {
  INVALID_EMAIL: 'Email khong hop le.',
  USER_NOT_FOUND: 'Khong co tai khoan voi email nay. Nguoi do phai tu dang ky truoc.',
  USER_NOT_ACTIVE: 'Tai khoan chua ACTIVE (chua xac thuc email, hoac dang bi khoa).',
  ADMIN_ROLE_MISSING: 'Chua co vai ADMIN. Chay `npm run db:deploy -w apps/api` truoc.',
};

function parseEmail(args: string[]): string {
  let email: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg.startsWith('--email=')) email = arg.slice('--email='.length);
    else if (arg === '--email') email = args[++index];
    else throw new Error(`Tham so khong ho tro: ${arg}`);
  }
  if (!email) throw new Error('Thieu --email=<email>');
  return email;
}

/** host:port/ten-csdl, bo user va mat khau, de nguoi chay thay minh dang tro vao dau. */
function describeTarget(connectionString: string): string {
  const url = new URL(connectionString);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

async function main(): Promise<void> {
  const email = parseEmail(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thieu DATABASE_URL');

  console.log(`CSDL dich: ${describeTarget(connectionString)}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg(prismaConnection(connectionString)) });
  try {
    const result = await grantAdminRole(prisma, email);
    if (result.outcome === 'GRANTED' || result.outcome === 'ALREADY_ADMIN') {
      console.log(`${result.outcome}: nguoi dung ${result.userId}`);
      return;
    }
    console.error(`${result.outcome}: ${FAILURE_HINTS[result.outcome]}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Chi in thong diep, khong in ca doi tuong loi: loi ket noi cua pg co the chua chuoi ket noi.
  console.error(error instanceof Error ? error.message : 'Loi khong xac dinh');
  process.exitCode = 1;
});
