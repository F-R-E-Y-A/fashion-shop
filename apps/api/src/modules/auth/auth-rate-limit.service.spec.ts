import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimiter, type RateLimitResult } from '../../infra/rate-limit/rate-limiter.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { type EndpointRateLimit, RATE_LIMIT_POLICY } from './rate-limit.policy.js';
import { RateLimitedException } from './rate-limited.exception.js';

const PEPPER = 'test-rate-limit-pepper-with-at-least-thirty-two-chars';

class FakeLimiter extends RateLimiter {
  readonly counts = new Map<string, number>();
  readonly consumed: string[] = [];
  failWith: Error | null = null;

  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.consumed.push(key);
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return Promise.resolve({
      allowed: count <= limit,
      count,
      limit,
      retryAfterSeconds: windowSeconds,
    });
  }

  reset(key: string): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.counts.delete(key);
    return Promise.resolve();
  }
}

function makeService(pepper = PEPPER) {
  const limiter = new FakeLimiter();
  const config = { get: () => pepper };
  return { limiter, service: new AuthRateLimitService(limiter, config as never) };
}

describe('AuthRateLimitService', () => {
  let limiter: FakeLimiter;
  let service: AuthRateLimitService;

  beforeEach(() => {
    ({ limiter, service } = makeService());
  });

  it('allows exactly `limit` attempts per identity then throws RateLimitedException', async () => {
    const { limit } = RATE_LIMIT_POLICY.LOGIN.identity;

    for (let i = 0; i < limit; i++) {
      await service.enforce('LOGIN', { ip: '198.51.100.1', identity: 'user@example.com' });
    }

    await expect(
      service.enforce('LOGIN', { ip: '198.51.100.1', identity: 'user@example.com' }),
    ).rejects.toBeInstanceOf(RateLimitedException);
  });

  it('carries the remaining window as retryAfterSeconds and reveals nothing else', async () => {
    const { limit, windowSeconds } = RATE_LIMIT_POLICY.CHANGE_PASSWORD.identity;
    for (let i = 0; i < limit; i++) await service.enforce('CHANGE_PASSWORD', { identity: 'u-1' });

    const error = await service
      .enforce('CHANGE_PASSWORD', { identity: 'u-1' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitedException);
    expect((error as RateLimitedException).retryAfterSeconds).toBe(windowSeconds);
    expect(JSON.stringify((error as RateLimitedException).getResponse())).not.toMatch(
      /u-1|count|remaining|attempt/i,
    );
  });

  it('checks the IP rule first, so a blocked IP does not consume the identity quota', async () => {
    const { limit } = RATE_LIMIT_POLICY.LOGIN.ip;
    for (let i = 0; i < limit; i++) {
      await service.enforce('LOGIN', { ip: '203.0.113.9', identity: `victim-${i}@example.com` });
    }
    const before = limiter.consumed.length;

    await expect(
      service.enforce('LOGIN', { ip: '203.0.113.9', identity: 'victim@example.com' }),
    ).rejects.toBeInstanceOf(RateLimitedException);

    // Only the IP counter was touched by the blocked call (one consume), never the identity one.
    expect(limiter.consumed.length - before).toBe(1);
    expect(limiter.consumed.at(-1)).toContain(':ip:');
  });

  it('counts an identity that does not exist exactly like one that does', async () => {
    const { limit } = RATE_LIMIT_POLICY.FORGOT_PASSWORD.identity;
    const outcomes = async (email: string) => {
      const results: string[] = [];
      for (let i = 0; i <= limit; i++) {
        results.push(
          await service
            .enforce('FORGOT_PASSWORD', { ip: '192.0.2.1', identity: email })
            .then(() => 'ok')
            .catch((error: unknown) => (error instanceof RateLimitedException ? '429' : 'other')),
        );
      }
      return results;
    };

    // The service never learns whether the email exists, so both sequences are identical.
    expect(await outcomes('real@example.com')).toEqual(await outcomes('ghost@example.com'));
  });

  it('never puts a raw email, userId, or IP in a store key', async () => {
    await service.enforce('LOGIN', { ip: '198.51.100.77', identity: 'Person@Example.com' });
    await service.enforce('CHANGE_PASSWORD', { identity: '0b7c9d52-uuid-user-id' });

    for (const key of limiter.consumed) {
      expect(key).not.toMatch(/198\.51\.100\.77|person|example\.com|0b7c9d52/i);
      expect(key).toMatch(/^[A-Z_]+:(ip|id):[0-9a-f]{64}$/);
    }
  });

  it('derives keys with the pepper: same input differs under another pepper, same under the same', async () => {
    const other = makeService('another-rate-limit-pepper-with-at-least-32-chars');
    await service.enforce('LOGIN', { identity: 'a@example.com' });
    await other.service.enforce('LOGIN', { identity: 'a@example.com' });
    await service.enforce('LOGIN', { identity: ' A@Example.com ' });

    const idKeys = (source: FakeLimiter) => source.consumed.filter((key) => key.includes(':id:'));
    expect(idKeys(limiter)[0]).not.toBe(idKeys(other.limiter)[0]);
    // Whitespace/case do not create a fresh bucket for the same identity.
    expect(idKeys(limiter)[1]).toBe(idKeys(limiter)[0]);
  });

  it('keeps separate buckets per endpoint for the same identity', async () => {
    await service.enforce('FORGOT_PASSWORD', { identity: 'a@example.com' });
    await service.enforce('RESEND_VERIFICATION', { identity: 'a@example.com' });

    const idKeys = limiter.consumed.filter((key) => key.includes(':id:'));
    expect(new Set(idKeys).size).toBe(2);
  });

  it('resetIdentity clears only that identity counter', async () => {
    for (let i = 0; i < 3; i++) await service.enforce('LOGIN', { identity: 'a@example.com' });
    await service.enforce('LOGIN', { identity: 'b@example.com' });

    await service.resetIdentity('LOGIN', 'a@example.com');

    const idKeys = [...limiter.counts.keys()].filter((key) => key.includes(':id:'));
    expect(idKeys).toHaveLength(1);
    expect(limiter.counts.get(idKeys[0]!)).toBe(1);
  });

  describe('when the rate-limit store fails', () => {
    beforeEach(() => {
      limiter.failWith = new Error('ECONNREFUSED');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it.each(['LOGIN', 'VERIFY_EMAIL', 'RESET_PASSWORD', 'CHANGE_PASSWORD'] as const)(
      'fails OPEN for %s: the request is let through',
      async (endpoint) => {
        expect(RATE_LIMIT_POLICY[endpoint].onStoreError).toBe('ALLOW');
        await expect(
          service.enforce(endpoint, { ip: '192.0.2.5', identity: 'a@example.com' }),
        ).resolves.toBeUndefined();
      },
    );

    it.each(['REGISTER', 'RESEND_VERIFICATION', 'FORGOT_PASSWORD'] as const)(
      'fails CLOSED for %s with a 503 that names neither Redis nor the limiter',
      async (endpoint) => {
        expect(RATE_LIMIT_POLICY[endpoint].onStoreError).toBe('DENY');

        const error = await service
          .enforce(endpoint, { ip: '192.0.2.5', identity: 'a@example.com' })
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect(JSON.stringify((error as ServiceUnavailableException).getResponse())).not.toMatch(
          /redis|limit|ECONNREFUSED/i,
        );
      },
    );

    it('does not let a failing reset break the successful login that triggered it', async () => {
      await expect(service.resetIdentity('LOGIN', 'a@example.com')).resolves.toBeUndefined();
    });
  });

  describe('policy invariants', () => {
    it('every endpoint declares its store-failure behaviour explicitly', () => {
      for (const [endpoint, policy] of Object.entries(RATE_LIMIT_POLICY)) {
        expect(['ALLOW', 'DENY'], endpoint).toContain(policy.onStoreError);
      }
    });

    it('every endpoint that emails an arbitrary third-party address fails closed', () => {
      for (const endpoint of ['REGISTER', 'RESEND_VERIFICATION', 'FORGOT_PASSWORD'] as const) {
        expect(RATE_LIMIT_POLICY[endpoint].onStoreError).toBe('DENY');
      }
    });

    it('identity and IP limits are positive integers with a sane window', () => {
      for (const policy of Object.values(RATE_LIMIT_POLICY) as EndpointRateLimit[]) {
        for (const rule of [policy.identity, policy.ip]) {
          if (!rule) continue;
          expect(Number.isInteger(rule.limit) && rule.limit > 0).toBe(true);
          expect(rule.windowSeconds).toBeGreaterThanOrEqual(60);
        }
      }
    });
  });
});
