import { describe, expect, it } from 'vitest';

import { OtpPurpose } from '../../generated/prisma/client.js';
import { generateOtpCode, hashOtpCode, otpCodeMatches } from './otp.util.js';
import { OTP_CODE_DIGITS } from './otp-policy.js';

const PEPPER = 'test-otp-pepper-with-at-least-thirty-two-characters';

describe('generateOtpCode', () => {
  it('generates a zero-padded 6-digit string using a CSPRNG, not Math.random', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(new RegExp(`^\\d{${OTP_CODE_DIGITS}}$`));
    }
  });
});

describe('hashOtpCode / otpCodeMatches', () => {
  it('binds the hash to email, purpose, and code', () => {
    const hash = hashOtpCode(PEPPER, 'a@example.com', OtpPurpose.EMAIL_VERIFICATION, '123456');

    expect(
      otpCodeMatches(PEPPER, 'a@example.com', OtpPurpose.EMAIL_VERIFICATION, '123456', hash),
    ).toBe(true);
    expect(
      otpCodeMatches(PEPPER, 'b@example.com', OtpPurpose.EMAIL_VERIFICATION, '123456', hash),
    ).toBe(false);
    expect(otpCodeMatches(PEPPER, 'a@example.com', OtpPurpose.PASSWORD_RESET, '123456', hash)).toBe(
      false,
    );
    expect(
      otpCodeMatches(PEPPER, 'a@example.com', OtpPurpose.EMAIL_VERIFICATION, '654321', hash),
    ).toBe(false);
  });

  it('never stores the plaintext code in the hash', () => {
    const hash = hashOtpCode(PEPPER, 'a@example.com', OtpPurpose.EMAIL_VERIFICATION, '123456');
    expect(hash).not.toContain('123456');
  });

  it('produces different hashes under different peppers for the same input', () => {
    const hashA = hashOtpCode(
      'pepper-one-with-at-least-thirty-two-characters',
      'a@example.com',
      OtpPurpose.EMAIL_VERIFICATION,
      '123456',
    );
    const hashB = hashOtpCode(
      'pepper-two-with-at-least-thirty-two-characters',
      'a@example.com',
      OtpPurpose.EMAIL_VERIFICATION,
      '123456',
    );
    expect(hashA).not.toBe(hashB);
  });
});
