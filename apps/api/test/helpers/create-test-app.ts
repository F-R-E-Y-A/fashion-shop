import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication;
  /** Goi HTTP vao app dang chay trong bo nho, khong mo cong. */
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  close(): Promise<void>;
}

/**
 * Dung app y het main.ts (cung configureApp) nhung khong lang nghe cong, de bai kiem thu
 * thay dung hanh vi cua ValidationPipe, AllExceptionsFilter va prefix /api.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    http: supertest(app.getHttpServer()),
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}
