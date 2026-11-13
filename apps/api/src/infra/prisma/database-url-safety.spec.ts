import { describe, expect, it } from 'vitest';

import { assertTestDatabaseConnection, parseDbIdentity } from './database-url-safety.js';

describe('database-url-safety', () => {
  it('parses database URL identity accurately', () => {
    const id = parseDbIdentity(
      'postgresql://fashion:secret@127.0.0.1:5432/fashion_shop_test?schema=public',
    );
    expect(id).toEqual({
      host: '127.0.0.1',
      port: '5432',
      database: 'fashion_shop_test',
    });
  });

  it('rejects missing or empty test URL', () => {
    expect(() =>
      assertTestDatabaseConnection(undefined, 'postgresql://localhost:5432/fashion_shop'),
    ).toThrow('BAT BUOC phai co bien moi truong DATABASE_URL_TEST');
    expect(() =>
      assertTestDatabaseConnection('', 'postgresql://localhost:5432/fashion_shop'),
    ).toThrow('BAT BUOC phai co bien moi truong DATABASE_URL_TEST');
  });

  it('rejects test URL without test in database name', () => {
    expect(() =>
      assertTestDatabaseConnection(
        'postgresql://localhost:5432/fashion_shop',
        'postgresql://localhost:5432/other',
      ),
    ).toThrow("Co so du lieu test khong hop le (fashion_shop). Ten database test phai chua 'test'");
  });

  it('rejects test URL pointing to the exact same database as primary URL', () => {
    expect(() =>
      assertTestDatabaseConnection(
        'postgresql://fashion:secret@127.0.0.1:5432/fashion_shop_test',
        'postgresql://fashion:secret@localhost:5432/fashion_shop_test',
      ),
    ).toThrow('NGUY HIEM: DATABASE_URL_TEST dang tro vao cung database');
  });

  it('accepts valid distinct test database URL', () => {
    const testUrl = 'postgresql://fashion:secret@localhost:5432/fashion_shop_test';
    const primaryUrl = 'postgresql://fashion:secret@localhost:5432/fashion_shop';
    expect(assertTestDatabaseConnection(testUrl, primaryUrl)).toBe(testUrl);
  });
});
