import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { RateLimiter, RateLimitResult } from '../../infra/rate-limit/rate-limiter.js';
import { CheckoutRateLimitService } from './checkout-rate-limit.service.js';

function fixture(consume: RateLimiter['consume']) {
  const limiter = { consume: vi.fn(consume), reset: vi.fn() } as unknown as RateLimiter;
  const config = { get: () => 'pepper-for-unit-test-only-32-chars!!' } as unknown as ConfigService;
  return { service: new CheckoutRateLimitService(limiter, config as never), limiter };
}
const result = (allowed: boolean): RateLimitResult => ({
  allowed,
  count: allowed ? 1 : 11,
  limit: 10,
  retryAfterSeconds: 42,
});

describe('PH-11 gioi han tao don theo tai khoan', () => {
  it('trong gioi han thi qua; vuot thi 429 kem retryAfterSeconds', async () => {
    const { service } = fixture(async () => result(true));
    await expect(service.enforce('u1', 'order')).resolves.toBeUndefined();
    const blocked = fixture(async () => result(false)).service;
    await expect(blocked.enforce('u1', 'order')).rejects.toMatchObject({
      status: 429,
      response: { error: 'RATE_LIMITED', retryAfterSeconds: 42 },
    });
  });

  it('khoa dem bam HMAC, khong chua user id tho; tach rieng tao don va thanh toan', async () => {
    const { service, limiter } = fixture(async () => result(true));
    await service.enforce('user-raw-id', 'order');
    await service.enforce('user-raw-id', 'payment');
    const calls = vi.mocked(limiter.consume).mock.calls;
    expect(calls[0]![0]).toMatch(/^checkout-order:user:[a-f0-9]{64}$/u);
    expect(calls[1]![0]).toMatch(/^checkout-payment:user:[a-f0-9]{64}$/u);
    expect(calls.map(([, limit]) => limit)).toEqual([10, 20]);
    expect(JSON.stringify(calls)).not.toContain('user-raw-id');
  });

  it('kho dem loi thi cho qua, khong chan mua hang', async () => {
    const { service } = fixture(async () => {
      throw new Error('redis down');
    });
    await expect(service.enforce('u1', 'order')).resolves.toBeUndefined();
  });
});
