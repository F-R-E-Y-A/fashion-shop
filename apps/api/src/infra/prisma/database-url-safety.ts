export interface DbIdentity {
  host: string;
  port: string;
  database: string;
}

export function parseDbIdentity(urlString: string): DbIdentity {
  const parsed = new URL(urlString);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || '5432';
  const database = parsed.pathname.replace(/^\//, '').toLowerCase();
  return { host, port, database };
}

/**
 * Bao ve co so du lieu: ngan chan tuyet doi viec chay script test/seed vao DB chinh/phat trien.
 * Bat buoc DATABASE_URL_TEST phai ton tai, co ten chua 'test', va khong duoc trung identity voi DATABASE_URL.
 */
export function assertTestDatabaseConnection(
  testUrl: string | undefined,
  primaryUrl: string | undefined,
): string {
  if (!testUrl || !testUrl.trim()) {
    throw new Error('BAT BUOC phai co bien moi truong DATABASE_URL_TEST de chay script test/seed.');
  }

  const testIdentity = parseDbIdentity(testUrl);

  if (!testIdentity.database.endsWith('_test') && !testIdentity.database.includes('test')) {
    throw new Error(
      `Co so du lieu test khong hop le (${testIdentity.database}). Ten database test phai chua 'test' hoac ket thuc bang '_test'.`,
    );
  }

  if (primaryUrl && primaryUrl.trim()) {
    try {
      const primaryIdentity = parseDbIdentity(primaryUrl);
      const isSameHost =
        testIdentity.host === primaryIdentity.host ||
        (['localhost', '127.0.0.1'].includes(testIdentity.host) &&
          ['localhost', '127.0.0.1'].includes(primaryIdentity.host));
      const isSamePort = testIdentity.port === primaryIdentity.port;
      const isSameDb = testIdentity.database === primaryIdentity.database;

      if (isSameHost && isSamePort && isSameDb && process.env.CI !== 'true') {
        throw new Error(
          `NGUY HIEM: DATABASE_URL_TEST dang tro vao cung database voi DATABASE_URL (${primaryIdentity.database}). Tu choi ket noi!`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('NGUY HIEM:')) {
        throw err;
      }
      // Bo qua loi parse primaryUrl neu primaryUrl khong phai URL chuan
    }
  }

  return testUrl;
}
