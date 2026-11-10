import { createHmac } from 'node:crypto';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infra/config/env.js';
import { RateLimiter, type RateLimitResult } from '../../infra/rate-limit/rate-limiter.js';

/** Lan goi moi phut moi tai khoan. Khach that tao don vai lan; retry cung idempotency key van dem. */
const LIMITS = { order: 10, payment: 20 } as const;
const WINDOW_SECONDS = 60;
const STORE_ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Chan mot tai khoan ban lien tuc tao don hay tao lan thanh toan, de khong chiem ket noi DB va
 * khoa gio cua khach khac. Kho dem (Redis) loi thi CHO QUA: transaction checkout da tu chan don
 * trung va ban vuot, con chan mua hang vi su co ha tang gay hai hon.
 */
@Injectable()
export class CheckoutRateLimitService {
  private readonly logger = new Logger(CheckoutRateLimitService.name);
  private lastErrorLogAt = 0;

  constructor(
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async enforce(userId: string, action: keyof typeof LIMITS): Promise<void> {
    const result = await this.consume(userId, action);
    if (result && !result.allowed) {
      // Cung hinh dang voi 429 cua Auth: AllExceptionsFilter dat header Retry-After tu retryAfterSeconds.
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: 'Bạn thao tác quá nhanh, hãy thử lại sau ít giây.',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** null khi kho dem loi: khi do cho di qua. */
  private async consume(
    userId: string,
    action: keyof typeof LIMITS,
  ): Promise<RateLimitResult | null> {
    try {
      return await this.limiter.consume(this.key(userId, action), LIMITS[action], WINDOW_SECONDS);
    } catch {
      this.logStoreError();
      return null;
    }
  }

  private key(userId: string, action: string): string {
    const digest = createHmac('sha256', this.config.get('RATE_LIMIT_PEPPER', { infer: true }))
      .update(`user:${userId}`)
      .digest('hex');
    return `checkout-${action}:user:${digest}`;
  }

  // Han che de khong ngap nhat ky khi Redis chet; khong ghi khoa hay id.
  private logStoreError(): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < STORE_ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    this.logger.error('Kho gioi han toc do loi (checkout), cho di qua');
  }
}
