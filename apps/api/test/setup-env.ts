/**
 * Chay truoc moi tep kiem thu HTTP: tro may chu vao CSDL KIEM THU, khong bao gio la CSDL that,
 * vi resetDatabase() xoa sach moi bang truoc khi nap lai du lieu gia.
 * Tren may: DATABASE_URL_TEST trong .env (tao bang npm run db:test:prepare).
 * Tren CI: hai bien tro cung mot Postgres dung xong bo, CI=true nen cho phep trung nhau.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '../../.env' });

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    'Thieu DATABASE_URL_TEST. Them vao .env theo .env.example roi chay: npm run db:test:prepare',
  );
}
if (testUrl === process.env.DATABASE_URL && process.env.CI !== 'true') {
  throw new Error('DATABASE_URL_TEST trung DATABASE_URL: kiem thu se xoa sach du lieu that.');
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
// Secret chi dung cho HTTP test; production phai cung cap JWT_ACCESS_SECRET tu moi truong.
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-with-at-least-thirty-two-characters';
process.env.OTP_PEPPER ??= 'test-otp-pepper-with-at-least-thirty-two-characters';
// MailService that duoc thay bang FakeMailService trong test/helpers/create-test-app.ts nen cac
// bien SMTP o day chi can hop le voi env.ts, khong bao gio duoc dung that.
process.env.SMTP_HOST ??= 'localhost';
process.env.SMTP_FROM ??= 'no-reply@fashion-shop.test';
