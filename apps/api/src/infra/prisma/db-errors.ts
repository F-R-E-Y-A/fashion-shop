/**
 * Nhan dien loi PostgreSQL di qua Prisma 7 + driver adapter (ADR-124).
 *
 * Hinh dang do that tren PostgreSQL voi Prisma 7.10 (test/db-conflict.http.spec.ts):
 * - deadlock o lenh ORM: `code: 'P2034'`, `meta.driverAdapterError.cause.originalCode: '40P01'`;
 * - ghi trung duoi RepeatableRead: `code: 'P2034'`, `originalCode: '40001'`;
 * - deadlock o `$queryRaw`/`$executeRaw` (advisory lock, SELECT ... FOR UPDATE): `code: 'P2010'`,
 *   `originalCode: '40P01'`. Chi doc `code` se bo sot ca nay.
 */

const CONFLICT_CODES = new Set(['P2034', '40001', '40P01']);
const UNIQUE_CODES = new Set(['P2002', '23505']);

/** Moi ma loi tim thay trong loi va cac lop boc (`meta`, `cause`, `driverAdapterError`). */
export function dbErrorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    for (const field of ['code', 'sqlState', 'originalCode'] as const) {
      if (typeof rec[field] === 'string') codes.push(rec[field]);
    }
    for (const field of ['meta', 'cause', 'driverAdapterError'] as const) {
      if (rec[field] && typeof rec[field] === 'object') queue.push(rec[field]);
    }
  }
  return codes;
}

/** Deadlock hoac serialization failure: transaction da bi Postgres huy, chay lai tu dau la an toan. */
export function isTransactionConflict(error: unknown): boolean {
  return dbErrorCodes(error).some((code) => CONFLICT_CODES.has(code));
}

export function isUniqueViolation(error: unknown): boolean {
  return dbErrorCodes(error).some((code) => UNIQUE_CODES.has(code));
}
