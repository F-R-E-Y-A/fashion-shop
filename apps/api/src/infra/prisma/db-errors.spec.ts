import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { dbErrorCodes, isTransactionConflict, isUniqueViolation } from './db-errors.js';

/** Dung hinh dang do that tren Postgres (test/db-conflict.http.spec.ts), khong tu che. */
function adapterError(code: string, originalCode: string, message = 'x') {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: '7.10.0',
    meta: {
      driverAdapterError: Object.assign(new Error('TransactionWriteConflict'), {
        name: 'DriverAdapterError',
        cause: { originalCode, originalMessage: 'm', kind: 'TransactionWriteConflict' },
      }),
    },
  });
}

describe('db-errors: nhan dien xung dot transaction qua Prisma 7 adapter', () => {
  it('deadlock ORM (P2034/40P01), ghi trung RR (P2034/40001), deadlock raw (P2010/40P01)', () => {
    for (const [code, original] of [
      ['P2034', '40P01'],
      ['P2034', '40001'],
      ['P2010', '40P01'],
    ] as const) {
      const error = adapterError(code, original);
      expect(dbErrorCodes(error)).toEqual(expect.arrayContaining([code, original]));
      expect(isTransactionConflict(error)).toBe(true);
    }
  });

  it('loi raw khac (P2010/23503) va unique khong phai xung dot transaction', () => {
    expect(isTransactionConflict(adapterError('P2010', '23503'))).toBe(false);
    expect(isTransactionConflict(adapterError('P2002', '23505'))).toBe(false);
    expect(isUniqueViolation(adapterError('P2010', '23505'))).toBe(true);
    expect(isTransactionConflict(new Error('boom'))).toBe(false);
    expect(isTransactionConflict(null)).toBe(false);
  });

  it('khong lap vo han khi loi tro vong', () => {
    const loop: Record<string, unknown> = { code: 'X' };
    loop.cause = loop;
    expect(dbErrorCodes(loop)).toEqual(['X']);
  });
});
