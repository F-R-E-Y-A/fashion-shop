// tools/db/prepare-test-db.mjs — tao co so du lieu KIEM THU neu chua co roi ap migration len do.
// Kiem thu HTTP xoa sach bang truoc moi lan chay, nen KHONG BAO GIO chay tren fashion_shop that.
// Dung: npm run db:test:prepare   (doc DATABASE_URL va DATABASE_URL_TEST trong .env o goc)
import { spawnSync } from 'node:child_process';

import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv();

const mainUrl = process.env.DATABASE_URL;
const testUrl = process.env.DATABASE_URL_TEST;
if (!mainUrl || !testUrl) {
  console.error('Thieu DATABASE_URL hoac DATABASE_URL_TEST trong .env. Xem .env.example.');
  process.exit(1);
}
if (mainUrl === testUrl) {
  console.error('DATABASE_URL_TEST phai khac DATABASE_URL: kiem thu se xoa sach du lieu.');
  process.exit(1);
}

const testDbName = decodeURIComponent(new URL(testUrl).pathname.slice(1));
const admin = new pg.Client({ connectionString: mainUrl });
await admin.connect();
try {
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    testDbName,
  ]);
  if (rowCount) {
    console.log(`CSDL kiem thu "${testDbName}" da co.`);
  } else {
    await admin.query(`CREATE DATABASE "${testDbName.replace(/"/g, '""')}"`);
    console.log(`Da tao CSDL kiem thu "${testDbName}".`);
  }
} finally {
  await admin.end();
}

console.log('Ap migration len CSDL kiem thu...');
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: 'apps/api',
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl },
});
process.exit(result.status ?? 1);
