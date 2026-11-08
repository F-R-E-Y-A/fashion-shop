import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nap lai CSDL kiem thu truoc moi lan chay E2E. Seed nam o apps/api (dung Prisma va helper test
 * cua API) va in mot dong JSON mo ta fixture; dong do di qua process.env toi cac worker.
 */
export default function globalSetup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const output = execSync('npm run e2e:seed -w apps/api --silent', { cwd: root, encoding: 'utf8' });
  const line = output.trim().split(/\r?\n/u).at(-1) ?? '';
  JSON.parse(line);
  process.env.E2E_FIXTURE = line;
}
