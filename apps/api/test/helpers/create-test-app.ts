import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { MailService } from '../../src/infra/mail/mail.service.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { FakeMailService } from './fake-mail.service.js';

export interface TestApp {
  app: INestApplication;
  /** Goi HTTP vao app dang chay trong bo nho, khong mo cong. */
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  /** MailService that: khong bao gio goi SMTP that trong kiem thu HTTP. */
  mail: FakeMailService;
  close(): Promise<void>;
}

/**
 * Dung app y het main.ts (cung configureApp) nhung khong lang nghe cong, de bai kiem thu
 * thay dung hanh vi cua ValidationPipe, AllExceptionsFilter va prefix /api.
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useClass(FakeMailService)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    http: supertest(app.getHttpServer()),
    prisma: app.get(PrismaService),
    mail: app.get(MailService) as unknown as FakeMailService,
    close: () => app.close(),
  };
}
