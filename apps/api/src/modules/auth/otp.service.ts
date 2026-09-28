import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpPurpose, Prisma } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.js';
import { generateOtpCode, hashOtpCode, otpCodeMatches } from './otp.util.js';
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from './otp-policy.js';

export interface IssuedOtp {
  code: string;
  expiresAt: Date;
}

/**
 * Discriminated outcome of verify(). Never thrown: a Prisma interactive transaction rolls back
 * every write made through its client as soon as the callback throws, so a "wrong code" outcome
 * cannot be signalled by throwing from inside one without also erasing the attemptCount increment
 * that outcome is supposed to persist. AuthService inspects this value only AFTER $transaction has
 * resolved (i.e. committed), then decides whether to raise an HTTP error.
 */
export type OtpVerifyOutcome =
  | { status: 'VERIFIED' }
  | { status: 'INVALID' }
  | { status: 'EXPIRED' }
  | { status: 'ATTEMPTS_EXCEEDED' };

/**
 * Owns OtpCode persistence and matching for every OtpPurpose. Deliberately knows nothing about
 * HTTP, users, or email delivery, so PASSWORD_RESET/GUEST_RETURN_VERIFICATION can reuse it later
 * without touching this file (docs/shared/data-model.md already reserves those purposes).
 */
@Injectable()
export class OtpService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /**
   * Invalidates any still-usable code for this email+purpose, then issues a fresh one.
   * Runs against `client` so callers can compose it into a larger transaction (e.g. register()
   * creating the user and its first OTP atomically).
   */
  async issue(
    client: Prisma.TransactionClient,
    params: { email: string; purpose: OtpPurpose; userId?: string },
  ): Promise<IssuedOtp> {
    const now = new Date();
    await client.otpCode.updateMany({
      where: { email: params.email, purpose: params.purpose, consumedAt: null },
      data: { consumedAt: now },
    });

    const code = generateOtpCode();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    await client.otpCode.create({
      data: {
        email: params.email,
        userId: params.userId,
        purpose: params.purpose,
        codeHash: this.hash(params.email, params.purpose, code),
        expiresAt,
        sendCount: 1,
      },
    });

    return { code, expiresAt };
  }

  /**
   * Validates `code` against the current active OTP for email+purpose and consumes it on success.
   * Every write below is a conditional `updateMany` (never a bare `update`) so that two concurrent
   * calls racing the same row can never both "win": whichever commits first flips consumedAt (or
   * pushes attemptCount to the limit) and the loser's WHERE clause simply matches zero rows.
   */
  async verify(
    client: Prisma.TransactionClient,
    params: { email: string; purpose: OtpPurpose; code: string },
  ): Promise<OtpVerifyOutcome> {
    const otp = await client.otpCode.findFirst({
      where: { email: params.email, purpose: params.purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return { status: 'INVALID' };
    if (otp.expiresAt <= new Date()) return { status: 'EXPIRED' };
    if (otp.attemptCount >= OTP_MAX_ATTEMPTS) return { status: 'ATTEMPTS_EXCEEDED' };

    if (!otpCodeMatches(this.pepper(), params.email, params.purpose, params.code, otp.codeHash)) {
      const incremented = await client.otpCode.updateMany({
        where: { id: otp.id, consumedAt: null, attemptCount: { lt: OTP_MAX_ATTEMPTS } },
        data: { attemptCount: { increment: 1 } },
      });
      // count === 0 means a concurrent request already pushed attemptCount to the limit (or
      // consumed/invalidated this row) between our read above and this write.
      return incremented.count === 0 ? { status: 'ATTEMPTS_EXCEEDED' } : { status: 'INVALID' };
    }

    const consumed = await client.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    // count === 0 means a concurrent request already consumed or invalidated (resend) this exact
    // row between our read above and this write; only the winner may report VERIFIED.
    return consumed.count === 0 ? { status: 'INVALID' } : { status: 'VERIFIED' };
  }

  /** True while a still-fresh code exists for email+purpose, i.e. resend must wait. */
  async isWithinResendCooldown(
    client: Prisma.TransactionClient,
    params: { email: string; purpose: OtpPurpose },
  ): Promise<boolean> {
    const latest = await client.otpCode.findFirst({
      where: { email: params.email, purpose: params.purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return false;
    return Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS;
  }

  private hash(email: string, purpose: OtpPurpose, code: string): string {
    return hashOtpCode(this.pepper(), email, purpose, code);
  }

  private pepper(): string {
    return this.config.get('OTP_PEPPER', { infer: true });
  }
}
