import { describe, expect, it } from 'vitest';

import { envSchema } from './env.js';

describe('SMTP_SECURE environment parsing', () => {
  const required = {
    DATABASE_URL: 'postgresql://local:local@localhost:5432/fashion_shop',
    JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-characters',
    OTP_PEPPER: 'test-otp-pepper-with-at-least-thirty-two-characters',
    SMTP_HOST: 'localhost',
    SMTP_FROM: 'no-reply@example.com',
  };

  it('treats the local string false as plaintext SMTP', () => {
    expect(envSchema.parse({ ...required, SMTP_SECURE: 'false' }).SMTP_SECURE).toBe(false);
  });

  it('accepts the string true for secure SMTP', () => {
    expect(envSchema.parse({ ...required, SMTP_SECURE: 'true' }).SMTP_SECURE).toBe(true);
  });

  it('defaults to plaintext SMTP when unset', () => {
    expect(envSchema.parse(required).SMTP_SECURE).toBe(false);
  });
});
