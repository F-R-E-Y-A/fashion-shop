import { describe, expect, it } from 'vitest';

import { envSchema } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://local:local@localhost:5432/fashion_shop',
  JWT_ACCESS_SECRET: 'test-access-secret-with-at-least-thirty-two-characters',
  OTP_PEPPER: 'test-otp-pepper-with-at-least-thirty-two-characters',
  SMTP_HOST: 'localhost',
  SMTP_FROM: 'no-reply@example.com',
  REDIS_URL: 'redis://localhost:6379',
  RATE_LIMIT_PEPPER: 'test-rate-limit-pepper-with-at-least-thirty-two-chars',
};

describe('SMTP_SECURE environment parsing', () => {
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

describe('PH3.4 rate-limit environment', () => {
  it('requires REDIS_URL and RATE_LIMIT_PEPPER with no default', () => {
    const { REDIS_URL: _redis, RATE_LIMIT_PEPPER: _pepper, ...withoutBoth } = required;

    const result = envSchema.safeParse(withoutBoth);

    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['REDIS_URL', 'RATE_LIMIT_PEPPER']));
  });

  it('rejects a REDIS_URL that is not a redis:// or rediss:// URL', () => {
    expect(envSchema.safeParse({ ...required, REDIS_URL: 'http://localhost:6379' }).success).toBe(
      false,
    );
    expect(
      envSchema.safeParse({ ...required, REDIS_URL: 'rediss://cache.example:6380' }).success,
    ).toBe(true);
  });

  it('rejects a RATE_LIMIT_PEPPER shorter than 32 characters', () => {
    expect(envSchema.safeParse({ ...required, RATE_LIMIT_PEPPER: 'too-short' }).success).toBe(
      false,
    );
  });
});

describe('TRUST_PROXY_HOPS', () => {
  it('is optional and parsed to a number outside staging/production', () => {
    expect(envSchema.parse(required).TRUST_PROXY_HOPS).toBeUndefined();
    expect(envSchema.parse({ ...required, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(1);
    expect(envSchema.parse({ ...required, TRUST_PROXY_HOPS: '0' }).TRUST_PROXY_HOPS).toBe(0);
  });

  it.each(['production', 'staging'])(
    'must be declared explicitly in %s so a wrong client-IP source cannot go unnoticed',
    (nodeEnv) => {
      const missing = envSchema.safeParse({ ...required, NODE_ENV: nodeEnv });
      expect(missing.success).toBe(false);
      expect(missing.error?.issues.map((issue) => issue.path.join('.'))).toContain(
        'TRUST_PROXY_HOPS',
      );

      expect(
        envSchema.safeParse({ ...required, NODE_ENV: nodeEnv, TRUST_PROXY_HOPS: '0' }).success,
      ).toBe(true);
    },
  );

  it.each(['-1', 'abc', '1.5', '100', ''])('rejects the malformed value %j', (value) => {
    expect(envSchema.safeParse({ ...required, TRUST_PROXY_HOPS: value }).success).toBe(false);
  });
});
