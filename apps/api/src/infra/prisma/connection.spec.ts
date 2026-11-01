import { describe, expect, it } from 'vitest';

import { prismaConnection } from './connection.js';

describe('Prisma PostgreSQL session configuration', () => {
  it('preserves connection options and forces UTC after any caller timezone', () => {
    const url = new URL(
      prismaConnection(
        'postgresql://user:password@localhost/db?schema=public&options=-c%20statement_timeout%3D5000%20-c%20timezone%3DAsia%2FTokyo',
      ).connectionString,
    );
    expect(url.searchParams.get('options')).toBe(
      '-c statement_timeout=5000 -c timezone=Asia/Tokyo -c timezone=UTC',
    );
    expect(url.searchParams.get('schema')).toBe('public');
  });

  it('chuyen gioi han pool cho pg, bo trong thi giu mac dinh cua pg', () => {
    const url = 'postgresql://user:password@localhost/db';
    expect(prismaConnection(url, { max: 25, connectionTimeoutMillis: 5000 })).toMatchObject({
      max: 25,
      connectionTimeoutMillis: 5000,
    });
    expect(Object.keys(prismaConnection(url))).toEqual(['connectionString']);
  });
});
