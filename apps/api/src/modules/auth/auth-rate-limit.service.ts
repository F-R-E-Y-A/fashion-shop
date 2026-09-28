import { createHmac } from 'node:crypto';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infra/config/env.js';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter.js';
import {
  type EndpointRateLimit,
  RATE_LIMIT_POLICY,
  type RateLimitedEndpoint,
  type RateLimitRule,
} from './rate-limit.policy.js';
import { RateLimitedException } from './rate-limited.exception.js';

interface Subject {
  /** req.ip; da la dia chi khach that khi TRUST_PROXY_HOPS khop voi ha tang. */
  ip?: string;
  /** Email da chuan hoa hoac userId. */
  identity?: string;
}

const STORE_ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Ap chinh sach gioi han toc do cua Auth len `RateLimiter` (Redis). Chi cong cua nay biet cach dat
 * khoa: khoa Redis chi chua ten endpoint, pham vi va HMAC-SHA256(RATE_LIMIT_PEPPER, gia tri), KHONG
 * bao gio chua email, userId hay IP dang tho, nen lo dump Redis khong lo ai da co gang dang nhap.
 */
@Injectable()
export class AuthRateLimitService {
  private readonly logger = new Logger(AuthRateLimitService.name);
  private lastStoreErrorLogAt = 0;

  constructor(
    private readonly limiter: RateLimiter,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Dem mot lan thu roi nem RateLimitedException (429) neu vuot bat ky muc nao. Kiem tra IP truoc de
   * mot IP bi chan khong lam can quota cua danh tinh khac. Loi kho dem thi theo `onStoreError` cua
   * tung endpoint: ALLOW cho di tiep, DENY tra 503.
   */
  async enforce(endpoint: RateLimitedEndpoint, subject: Subject): Promise<void> {
    const policy: EndpointRateLimit = RATE_LIMIT_POLICY[endpoint];
    try {
      if (policy.ip) await this.consume(endpoint, 'ip', subject.ip ?? 'unknown', policy.ip);
      if (policy.identity && subject.identity !== undefined) {
        await this.consume(endpoint, 'id', subject.identity, policy.identity);
      }
    } catch (error) {
      if (error instanceof RateLimitedException) throw error;

      this.logStoreError(endpoint, policy.onStoreError);
      if (policy.onStoreError === 'DENY') {
        throw new ServiceUnavailableException({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Dich vu tam thoi khong kha dung, hay thu lai sau',
        });
      }
    }
  }

  /** Xoa bo dem danh tinh (vd sau khi dang nhap thanh cong). Best-effort: loi kho khong lam hong luong chinh. */
  async resetIdentity(endpoint: RateLimitedEndpoint, identity: string): Promise<void> {
    try {
      await this.limiter.reset(this.key(endpoint, 'id', identity));
    } catch {
      this.logStoreError(endpoint, 'ALLOW');
    }
  }

  private async consume(
    endpoint: RateLimitedEndpoint,
    scope: 'ip' | 'id',
    value: string,
    rule: RateLimitRule,
  ): Promise<void> {
    const result = await this.limiter.consume(
      this.key(endpoint, scope, value),
      rule.limit,
      rule.windowSeconds,
    );
    if (!result.allowed) throw new RateLimitedException(result.retryAfterSeconds);
  }

  private key(endpoint: RateLimitedEndpoint, scope: 'ip' | 'id', value: string): string {
    const digest = createHmac('sha256', this.config.get('RATE_LIMIT_PEPPER', { infer: true }))
      .update(`${scope}:${value.trim().toLowerCase()}`)
      .digest('hex');
    return `${endpoint}:${scope}:${digest}`;
  }

  // Chi ghi ten endpoint va hanh dong, khong ghi khoa, IP hay danh tinh. Han che de khong ngap log khi Redis chet.
  private logStoreError(endpoint: RateLimitedEndpoint, action: 'ALLOW' | 'DENY'): void {
    const now = Date.now();
    if (now - this.lastStoreErrorLogAt < STORE_ERROR_LOG_INTERVAL_MS) return;
    this.lastStoreErrorLogAt = now;
    this.logger.error(`Kho gioi han toc do loi (endpoint=${endpoint}, xu ly=${action})`);
  }
}
