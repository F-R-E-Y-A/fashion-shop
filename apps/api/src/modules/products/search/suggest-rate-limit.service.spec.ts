import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../infra/config/env.js';
import type { RateLimiter } from '../../../infra/rate-limit/rate-limiter.js';
import { SuggestRateLimitService } from './suggest-rate-limit.service.js';

const config = { get: () => 'p'.repeat(32) } as unknown as ConfigService<Env, true>;

function make(consume: RateLimiter['consume']) {
  const limiter = { consume: vi.fn(consume), reset: vi.fn() } as unknown as RateLimiter;
  return { limiter, service: new SuggestRateLimitService(limiter, config) };
}

describe('SuggestRateLimitService (goi y tim kiem)', () => {
  it('trong gioi han thi cho qua, gioi han 60 lan moi 60 giay', async () => {
    const { limiter, service } = make(async () => ({
      allowed: true,
      count: 1,
      limit: 60,
      retryAfterSeconds: 60,
    }));
    await expect(service.enforce('203.0.113.7')).resolves.toBeUndefined();
    expect(limiter.consume).toHaveBeenCalledWith(expect.any(String), 60, 60);
  });

  it('vuot gioi han thi nem 429 co retryAfterSeconds de dat header Retry-After', async () => {
    const { service } = make(async () => ({
      allowed: false,
      count: 61,
      limit: 60,
      retryAfterSeconds: 17,
    }));
    const error = await service.enforce('203.0.113.7').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      error: 'RATE_LIMITED',
      retryAfterSeconds: 17,
    });
  });

  it('khoa Redis khong chua IP tho', async () => {
    const { limiter, service } = make(async () => ({
      allowed: true,
      count: 1,
      limit: 60,
      retryAfterSeconds: 60,
    }));
    await service.enforce('203.0.113.7');
    const key = (limiter.consume as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(key.startsWith('search-suggest:ip:')).toBe(true);
    expect(key).not.toContain('203.0.113.7');
  });

  it('cung IP cho cung khoa, IP khac cho khoa khac', async () => {
    const keys: string[] = [];
    const { service } = make(async (key) => {
      keys.push(key);
      return { allowed: true, count: 1, limit: 60, retryAfterSeconds: 60 };
    });
    await service.enforce('1.1.1.1');
    await service.enforce('1.1.1.1');
    await service.enforce('2.2.2.2');
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  it('Redis loi thi cho qua (API chi doc), khong nem loi', async () => {
    const { service } = make(async () => {
      throw new Error('Redis chet');
    });
    await expect(service.enforce('203.0.113.7')).resolves.toBeUndefined();
  });

  it('khong co IP van dem duoc (gom vao mot khoa)', async () => {
    const { limiter, service } = make(async () => ({
      allowed: true,
      count: 1,
      limit: 60,
      retryAfterSeconds: 60,
    }));
    await service.enforce(undefined);
    expect(limiter.consume).toHaveBeenCalledTimes(1);
  });
});
