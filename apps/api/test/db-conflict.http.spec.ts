import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Prisma } from '../src/generated/prisma/client.js';
import { isTransactionConflict } from '../src/infra/prisma/db-errors.js';
import { cartTransaction } from '../src/modules/cart/cart-transaction.js';
import { runCategoryTxWithRetry } from '../src/modules/products/category-visibility.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/**
 * ADR-124: hinh dang loi xung dot transaction cua Prisma 7 adapter tren Postgres that, va hai
 * wrapper retry co bat duoc deadlock o lenh raw (advisory lock, FOR UPDATE) khong.
 */
let t: TestApp;
let a: string;
let b: string;

const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
};
const touch = (tx: Prisma.TransactionClient, id: string) =>
  tx.$executeRaw`UPDATE users SET password_hash = 'x' WHERE id = ${id}::uuid`;

/** Hai transaction khoa a,b nguoc thu tu. `first` cho truoc nen bi Postgres chon lam nan nhan. */
async function deadlock(
  first: (body: (tx: Prisma.TransactionClient) => Promise<void>) => Promise<unknown>,
) {
  const aLocked = gate();
  const bLocked = gate();
  let attempts = 0;
  const victim = first(async (tx) => {
    attempts += 1;
    await touch(tx, a);
    if (attempts === 1) {
      aLocked.open();
      await bLocked.opened;
    }
    await touch(tx, b);
  });
  const other = t.prisma.$transaction(async (tx) => {
    await aLocked.opened;
    await touch(tx, b);
    bLocked.open();
    // Nan nhan da cho khoa b truoc; deadlock_timeout (1 giay) cua no het truoc nen no bi huy.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await touch(tx, a);
  });
  const [result] = await Promise.allSettled([victim, other]);
  return { result, attempts, other: await other.then(() => 'ok') };
}

beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
beforeEach(async () => {
  await resetDatabase(t.prisma);
  [a, b] = (
    await Promise.all(
      ['dc-a@x.test', 'dc-b@x.test'].map((email) =>
        t.prisma.user.create({ data: { email, passwordHash: 'p', status: 'ACTIVE' } }),
      ),
    )
  ).map((user) => user.id) as [string, string];
});

describe('ADR-124 xung dot transaction tren Postgres that', () => {
  it('deadlock raw la P2010/40P01 va van duoc nhan la xung dot', async () => {
    const { result, attempts } = await deadlock((body) => t.prisma.$transaction(body));
    expect(attempts).toBe(1);
    expect(result.status).toBe('rejected');
    const error = (result as PromiseRejectedResult).reason as { code: string };
    expect(error.code).toBe('P2010');
    expect(isTransactionConflict(error)).toBe(true);
  });

  it('deadlock ORM la P2034, ghi trung duoi RepeatableRead la P2034/40001', async () => {
    const orm = await Promise.allSettled(
      [
        [a, b],
        [b, a],
      ].map(async ([x, y], i) => {
        await new Promise((resolve) => setTimeout(resolve, i * 50));
        return t.prisma.$transaction(async (tx) => {
          await tx.user.update({ where: { id: x! }, data: { passwordHash: 'o' } });
          await new Promise((resolve) => setTimeout(resolve, 200));
          await tx.user.update({ where: { id: y! }, data: { passwordHash: 'o' } });
        });
      }),
    );
    const lost = orm.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: 'P2034' });
    expect(isTransactionConflict(lost.reason)).toBe(true);

    const rr = await t.prisma
      .$transaction(
        async (tx) => {
          await tx.user.findUnique({ where: { id: a } });
          await t.prisma.user.update({ where: { id: a }, data: { passwordHash: 'z' } });
          await tx.user.update({ where: { id: a }, data: { passwordHash: 'w' } });
        },
        { isolationLevel: 'RepeatableRead' },
      )
      .catch((error: unknown) => error);
    expect(rr).toMatchObject({ code: 'P2034' });
    expect(JSON.stringify(rr)).toContain('40001');
    expect(isTransactionConflict(rr)).toBe(true);
  });

  it.each([
    [
      'cartTransaction',
      (body: (tx: Prisma.TransactionClient) => Promise<void>) =>
        cartTransaction(t.prisma, ['user:dc'], body),
    ],
    [
      'runCategoryTxWithRetry',
      (body: (tx: Prisma.TransactionClient) => Promise<void>) =>
        runCategoryTxWithRetry(t.prisma, body),
    ],
  ])('%s chay lai khi bi deadlock o lenh raw, lan hai thanh cong', async (_name, wrap) => {
    const { result, attempts, other } = await deadlock(wrap);
    expect(result.status).toBe('fulfilled');
    expect(attempts).toBe(2);
    expect(other).toBe('ok');
  });
});
