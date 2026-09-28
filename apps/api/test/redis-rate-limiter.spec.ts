import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RateLimitModule } from '../src/infra/rate-limit/rate-limit.module.js';
import { RateLimiter } from '../src/infra/rate-limit/rate-limiter.js';
import { RedisRateLimiter } from '../src/infra/rate-limit/redis-rate-limiter.js';
import { REDIS_CLIENT } from '../src/infra/redis/redis.module.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RedisRateLimiter against a real Redis', () => {
  let redis: Redis;
  let limiter: RedisRateLimiter;
  const key = (name: string) => `spec:${name}:${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!, { enableOfflineQueue: false });
    await new Promise<void>((resolve) =>
      redis.status === 'ready' ? resolve() : redis.once('ready', () => resolve()),
    );
    limiter = new RedisRateLimiter(redis, { get: () => 'test' } as never);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('counts each hit, reports the limit, and blocks once the count exceeds it', async () => {
    const k = key('basic');

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume(k, 3, 60));

    expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4]);
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]).toMatchObject({ limit: 3 });
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]!.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('is atomic: of 100 parallel hits with limit 10, exactly 10 are allowed', async () => {
    const k = key('parallel');

    const results = await Promise.all(
      Array.from({ length: 100 }, () => limiter.consume(k, 10, 60)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(new Set(results.map((r) => r.count)).size).toBe(100); // no lost increments
  });

  it('sets the window on the first hit only; later hits do not extend it', async () => {
    const k = key('window');
    await limiter.consume(k, 5, 5);
    await sleep(1_200);

    const second = await limiter.consume(k, 5, 5);

    expect(second.retryAfterSeconds).toBeLessThanOrEqual(4);
  });

  it('starts a fresh window after the previous one expires', async () => {
    const k = key('expiry');
    await limiter.consume(k, 1, 1);
    await limiter.consume(k, 1, 1); // blocked
    await sleep(1_300);

    const fresh = await limiter.consume(k, 1, 1);

    expect(fresh).toMatchObject({ count: 1, allowed: true });
  });

  it('self-heals a counter that somehow has no TTL, so it can never lock a user out forever', async () => {
    const k = key('no-ttl');
    await redis.set(`fs:rl:test:${k}`, '7'); // no EXPIRE

    const result = await limiter.consume(k, 5, 60);

    expect(result.allowed).toBe(false);
    expect(await redis.ttl(`fs:rl:test:${k}`)).toBeGreaterThan(0);
  });

  it('reset clears the counter', async () => {
    const k = key('reset');
    for (let i = 0; i < 3; i++) await limiter.consume(k, 3, 60);

    await limiter.reset(k);

    expect(await limiter.consume(k, 3, 60)).toMatchObject({ count: 1, allowed: true });
  });

  it('namespaces keys per environment so test and development never share counters', async () => {
    const k = key('namespace');
    const other = new RedisRateLimiter(redis, { get: () => 'development' } as never);
    await limiter.consume(k, 1, 60);
    await limiter.consume(k, 1, 60); // blocked in the test namespace

    expect(await other.consume(k, 1, 60)).toMatchObject({ count: 1, allowed: true });
    await other.reset(k);
  });
});

describe('Redis unavailable', () => {
  it('does not stop the application from booting, and every command then fails immediately', async () => {
    const started = Date.now();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ NODE_ENV: 'test', REDIS_URL: 'redis://127.0.0.1:1' })],
        }),
        RateLimitModule,
      ],
    }).compile();
    await moduleRef.init();
    const bootMs = Date.now() - started;

    const limiter = moduleRef.get(RateLimiter);
    const commandStarted = Date.now();
    await expect(limiter.consume('k', 5, 60)).rejects.toBeInstanceOf(Error);
    await expect(limiter.reset('k')).rejects.toBeInstanceOf(Error);
    const commandsMs = Date.now() - commandStarted;

    // Bounded boot wait (~2s) and no per-request stall while Redis is down.
    expect(bootMs).toBeLessThan(6_000);
    expect(commandsMs).toBeLessThan(250);
    expect(moduleRef.get(REDIS_CLIENT).status).not.toBe('ready');
    await moduleRef.close();
  });
});
