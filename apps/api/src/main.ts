import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './infra/config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app, { swagger: true });

  const config = app.get(ConfigService) as ConfigService<Env, true>;
  // Nen tang (Render, Azure) cap PORT; tren may thi dung API_PORT trong .env.
  const port = config.get('PORT', { infer: true }) ?? config.get('API_PORT', { infer: true });
  // 0.0.0.0 de chay duoc trong container, khong chi tren localhost cua may.
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`May chu chay tai http://localhost:${port}/api`);
  logger.log(`Dac ta API tai  http://localhost:${port}/api/docs`);
}

void bootstrap();
