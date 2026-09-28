import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';

import type { Env } from '../config/env.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { RateLimiter, type RateLimitResult } from './rate-limiter.js';

/**
 * Tien to khoa theo moi truong: kiem thu (NODE_ENV=test) va phat trien dung chung mot Redis local
 * van khong dung vao du lieu cua nhau, va don sach khoa test khong the xoa khoa that.
 */
export function rateLimitKeyPrefix(nodeEnv: string): string {
  return `fs:rl:${nodeEnv}:`;
}

// INCR + dat han trong MOT script de khong co khe giua "tang" va "dat TTL" (khoa mo coi khong han
// se khoa nguoi dung vinh vien). TTL < 0 chi xay ra neu khoa bi mat han do su co, dat lai cho an toan.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

type RedisWithConsume = Redis & {
  rateLimitConsume(key: string, windowSeconds: number): Promise<[number, number]>;
};

@Injectable()
export class RedisRateLimiter extends RateLimiter {
  private readonly client: RedisWithConsume;
  private readonly prefix: string;

  constructor(@Inject(REDIS_CLIENT) redis: Redis, config: ConfigService<Env, true>) {
    super();
    redis.defineCommand('rateLimitConsume', { numberOfKeys: 1, lua: CONSUME_SCRIPT });
    this.client = redis as RedisWithConsume;
    this.prefix = rateLimitKeyPrefix(config.get('NODE_ENV', { infer: true }));
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const [count, ttl] = await this.client.rateLimitConsume(this.prefix + key, windowSeconds);
    return { allowed: count <= limit, count, limit, retryAfterSeconds: Math.max(1, ttl) };
  }

  async reset(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }
}
