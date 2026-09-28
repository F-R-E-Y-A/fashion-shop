import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module.js';
import { RateLimiter } from './rate-limiter.js';
import { RedisRateLimiter } from './redis-rate-limiter.js';

@Module({
  imports: [RedisModule],
  providers: [{ provide: RateLimiter, useClass: RedisRateLimiter }],
  exports: [RateLimiter, RedisModule],
})
export class RateLimitModule {}
