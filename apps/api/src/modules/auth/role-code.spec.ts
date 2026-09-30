import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ROLE_CODES, RoleCode } from './role-code.js';

const migrationsDir = fileURLToPath(new URL('../../../prisma/migrations/', import.meta.url));

/** Ma vai ma MOI migration nap vao bang roles (moi dong `('MA', 'Ten')` trong INSERT INTO "roles"). */
function roleCodesInMigrations(): string[] {
  const codes = new Set<string>();
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = readFileSync(`${migrationsDir}${entry.name}/migration.sql`, 'utf8');
    for (const insert of sql.matchAll(/INSERT INTO "roles"[^;]*;/g)) {
      for (const [, code] of insert[0].matchAll(/\(\s*'([A-Z_]+)'\s*,/g)) codes.add(code!);
    }
  }
  return [...codes].sort();
}

describe('RoleCode', () => {
  it('chi co CUSTOMER va ADMIN o Admin.1 (STAFF chua lam)', () => {
    expect(RoleCode).toEqual({ CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN' });
    expect([...ROLE_CODES].sort()).toEqual(['ADMIN', 'CUSTOMER']);
  });

  it('khop dung danh muc vai ma migration nap, khong thieu khong thua', () => {
    expect(roleCodesInMigrations()).toEqual([...ROLE_CODES].sort());
  });
});
