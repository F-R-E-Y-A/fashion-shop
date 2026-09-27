import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type { OtpPurpose } from '../../generated/prisma/client.js';
import { OTP_CODE_DIGITS } from './otp-policy.js';

const OTP_MAX_EXCLUSIVE = 10 ** OTP_CODE_DIGITS;

/** node:crypto.randomInt is CSPRNG-backed, unlike Math.random(). */
export function generateOtpCode(): string {
  return randomInt(0, OTP_MAX_EXCLUSIVE).toString().padStart(OTP_CODE_DIGITS, '0');
}

/**
 * Binds the hash to email + purpose + code so a code leaked/guessed for one email or purpose
 * cannot be replayed against another. Plain SHA-256 alone is not enough for a 6-digit,
 * low-entropy value if the database leaks; HMAC with a server-only pepper is required.
 */
export function hashOtpCode(
  pepper: string,
  email: string,
  purpose: OtpPurpose,
  code: string,
): string {
  return createHmac('sha256', pepper).update(`${email}:${purpose}:${code}`).digest('hex');
}

/** Constant-time comparison so guessing cannot be sped up by measuring response time. */
export function otpCodeMatches(
  pepper: string,
  email: string,
  purpose: OtpPurpose,
  code: string,
  expectedHash: string,
): boolean {
  const candidate = Buffer.from(hashOtpCode(pepper, email, purpose, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
