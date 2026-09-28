import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import type { Env } from '../config/env.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const READY_WAIT_MS = 2_000;

/**
 * Mot ket noi Redis dung chung. Cau hinh de MOT LENH LOI NGAY khi Redis khong toi duoc (khong xep
 * hang doi ngoai tuyen, co han thoi gian cho): noi goi quyet dinh mo hay chan theo chinh sach cua
 * tung tinh nang, khong bi treo request. Da do: cong dong -> lenh bi tu choi sau 0 ms.
 */
async function createRedisClient(config: ConfigService<Env, true>): Promise<Redis> {
  const logger = new Logger('Redis');
  const client = new Redis(config.get('REDIS_URL', { infer: true }), {
    enableOfflineQueue: false,
    commandTimeout: 1_000,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  });

  // Chi ghi trang thai chuyen doi, khong ghi moi lan thu lai, va khong ghi URL (co the chua mat khau).
  let degraded = false;
  client.on('error', (error: Error) => {
    if (degraded) return;
    degraded = true;
    logger.error(
      `Mat ket noi Redis, cac gioi han toc do se theo chinh sach mo/chan: ${error.message}`,
    );
  });
  client.on('ready', () => {
    if (degraded) logger.log('Da ket noi lai Redis');
    degraded = false;
  });

  // Cho toi da vai giay de ket noi xong roi vao thang, nhung KHONG lam hong luc khoi dong: Redis
  // chua san sang thi API van chay va cac gioi han xu ly theo chinh sach loi kho.
  if (client.status !== 'ready') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, READY_WAIT_MS);
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  return client;
}

class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

@Module({
  providers: [
    { provide: REDIS_CLIENT, inject: [ConfigService], useFactory: createRedisClient },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
