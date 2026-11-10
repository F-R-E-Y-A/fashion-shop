import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import supertest from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import type { Env } from '../../src/infra/config/env.js';
import { MailService } from '../../src/infra/mail/mail.service.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { RateLimiter } from '../../src/infra/rate-limit/rate-limiter.js';
import { rateLimitKeyPrefix } from '../../src/infra/rate-limit/redis-rate-limiter.js';
import { REDIS_CLIENT } from '../../src/infra/redis/redis.module.js';
import { EMBEDDER, type Embedder } from '../../src/modules/products/search/semantic/embedder.js';
import { FailingRateLimiter } from './failing-rate-limiter.js';
import { FakeMailService } from './fake-mail.service.js';

export interface TestApp {
  app: INestApplication;
  /** Goi HTTP vao app dang chay trong bo nho, khong mo cong. */
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  /** MailService that: khong bao gio goi SMTP that trong kiem thu HTTP. */
  mail: FakeMailService;
  redis: Redis;
  /** Xoa moi bo dem gioi han cua moi truong test (chi khoa co tien to test, khong dung khoa that). */
  resetRateLimits(): Promise<void>;
  close(): Promise<void>;
}

export interface TestAppOptions {
  /** Thay kho gioi han bang kho luon loi, de kiem chinh sach mo/chan khi Redis chet. */
  failingRateLimiter?: boolean;
  /**
   * Ghi de gia tri cau hinh CHI cho app nay (vd TRUST_PROXY_HOPS). Khong the ghi de process.env vi
   * ConfigModule.forRoot chot bien moi truong luc import, nen ta va ConfigService.get cua rieng app.
   */
  config?: Partial<Env>;
  /** Bat tim kiem ngu nghia bang bo nhung nay thay cho mo hinh that (ADR-048). */
  embedder?: Embedder;
}

/**
 * Dung app y het main.ts (cung configureApp) nhung khong lang nghe cong, de bai kiem thu
 * thay dung hanh vi cua ValidationPipe, AllExceptionsFilter va prefix /api.
 */
export function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  return buildTestApp(options);
}

async function buildTestApp(options: TestAppOptions): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useClass(FakeMailService);
  if (options.failingRateLimiter) {
    builder = builder.overrideProvider(RateLimiter).useClass(FailingRateLimiter);
  }
  if (options.embedder) {
    builder = builder.overrideProvider(EMBEDDER).useValue(options.embedder);
  }

  const moduleRef = await builder.compile();
  if (options.config) patchConfig(moduleRef.get(ConfigService), options.config);
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  // Nghe MOT LAN, tren dia chi CU THE 127.0.0.1, thay vi de supertest goi server.listen(0) cho tung
  // request. listen(0) kieu wildcard van bind duoc tren macOS ke ca khi mot tien trinh khac (helper cua
  // IDE, language server...) dang giu cung cong tren 127.0.0.1, va khi do ket noi toi 127.0.0.1:cong lai
  // do dich vu la tra loi: test thinh thoang nhan 404/401 tu mot may chu khong lien quan (da tai hien
  // bang thi nghiem rieng). Bind dia chi cu the thi cong trung bi he dieu hanh tu choi (EADDRINUSE).
  await app.listen(0, '127.0.0.1');

  const redis = app.get<Redis>(REDIS_CLIENT, { strict: false });
  return {
    app,
    http: supertest(app.getHttpServer()),
    prisma: app.get(PrismaService),
    mail: app.get(MailService) as unknown as FakeMailService,
    redis,
    resetRateLimits: async () => {
      const match = `${rateLimitKeyPrefix('test')}*`;
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) await redis.unlink(...keys);
      } while (cursor !== '0');
    },
    close: () => app.close(),
  };
}

function patchConfig(config: ConfigService, overrides: Partial<Env>): void {
  const original = config.get.bind(config) as (key: string, ...rest: unknown[]) => unknown;
  (config as unknown as { get: typeof original }).get = (key, ...rest) =>
    key in overrides ? overrides[key as keyof Env] : original(key, ...rest);
}
