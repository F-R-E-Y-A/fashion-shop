import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = Number(config.get('API_PORT') ?? 3000);

  // Moi duong dan deu bat dau bang /api de sau nay dat chung mot ten mien
  // voi giao dien web ma khong dam nhau.
  app.setGlobalPrefix('api');

  // Trong giai doan phat trien thi mo cho may chu Vite goi vao.
  // Truoc khi len that phai thay bang danh sach ten mien cu the.
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // bo moi truong khong khai bao trong DTO
      forbidNonWhitelisted: true, // gui truong la thi bao loi thay vi im lang
      transform: true, // doi chuoi tren duong dan thanh so, ngay, theo kieu cua DTO
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API website thuong mai dien tu thoi trang')
    .setDescription(
      'Dac ta giao dien lap trinh goc. Moi phan he tu bo sung duong dan cua minh bang cac chu thich cua Swagger.',
    )
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`May chu chay tai http://localhost:${port}/api`);
  logger.log(`Dac ta API tai  http://localhost:${port}/api/docs`);
}

void bootstrap();
