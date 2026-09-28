import { Injectable } from '@nestjs/common';

import { RateLimiter, type RateLimitResult } from '../../src/infra/rate-limit/rate-limiter.js';

/** Mo phong kho gioi han bi hong (Redis chet): moi lenh deu that bai. */
@Injectable()
export class FailingRateLimiter extends RateLimiter {
  consume(): Promise<RateLimitResult> {
    return Promise.reject(new Error('rate limit store unavailable'));
  }

  reset(): Promise<void> {
    return Promise.reject(new Error('rate limit store unavailable'));
  }
}
