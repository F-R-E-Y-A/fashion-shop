import { createHmac } from 'node:crypto';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../infra/config/env.js';
import { RateLimiter, type RateLimitResult } from '../../../infra/rate-limit/rate-limiter.js';

const LIMIT = 60;
const WINDOW_SECONDS = 60;
const STORE_ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Gioi han goi y tim kiem: 60 lan moi phut moi IP. Khoa Redis chi chua HMAC cua IP, khong chua IP tho.
 * Kho dem (Redis) loi thi CHO QUA: day la API chi doc, chan ca o tim kiem vi su co ha tang gay hai
 * hon la mo cua (ADR-019). Khac voi cac cua xac thuc cua Auth, noi mo cua co the bi loi dung de gui thu.
 */
@Injectable()
export class SuggestRateLimitService {
  private readonly logger = new Logger(SuggestRateLimitService.name);
  private lastErrorLogAt = 0;

  constructor(
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async enforce(ip: string | undefined): Promise<void> {
    const result = await this.consume(ip ?? 'unknown');
    if (result && !result.allowed) {
      // Cung hinh dang voi 429 cua Auth: AllExceptionsFilter dat header Retry-After tu retryAfterSeconds.
      throw new HttpException(
        {
          error: 'RATE_LIMITED',
          message: 'Qua nhieu yeu cau, hay thu lai sau',
          retryAfterSeconds: result.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** null khi kho dem loi: khi do cho di qua. */
  private async consume(ip: string): Promise<RateLimitResult | null> {
    try {
      return await this.limiter.consume(this.key(ip), LIMIT, WINDOW_SECONDS);
    } catch {
      this.logStoreError();
      return null;
    }
  }

  private key(ip: string): string {
    const digest = createHmac('sha256', this.config.get('RATE_LIMIT_PEPPER', { infer: true }))
      .update(`ip:${ip.trim().toLowerCase()}`)
      .digest('hex');
    return `search-suggest:ip:${digest}`;
  }

  // Han che de khong ngap nhat ky khi Redis chet; khong ghi khoa hay IP.
  private logStoreError(): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < STORE_ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLogAt = now;
    this.logger.error('Kho gioi han toc do loi (search-suggest), cho di qua');
  }
}
