import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { corsOrigins, type Env } from './infra/config/env.js';

/**
 * Moi thiet lap toan cuc o MOT cho, de main.ts va bo kiem thu HTTP (test/helpers) dung app y het nhau.
 * Them middleware, pipe, guard toan cuc thi them o day, khong them o main.ts.
 */
export function configureApp(app: INestApplication, options: { swagger?: boolean } = {}): void {
  const config = app.get(ConfigService) as ConfigService<Env, true>;

  // Moi duong dan bat dau bang /api de sau nay dat chung ten mien voi web ma khong dam nhau.
  app.setGlobalPrefix('api');

  // Chi cac goc web khai trong CORS_ORIGINS moi goi duoc API. Staging dien dung dia chi web cua no.
  app.enableCors({
    origin: corsOrigins(config.get('CORS_ORIGINS', { infer: true })),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // bo moi truong khong khai bao trong DTO
      forbidNonWhitelisted: true, // gui truong la thi bao loi 400 thay vi im lang
      transform: true, // doi chuoi tren duong dan thanh so, ngay, theo kieu cua DTO
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  if (options.swagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('API website thuong mai dien tu thoi trang')
      .setDescription(
        'Dac ta sinh tu chu thich Swagger trong tung phan he. Quy uoc duong dan, phan trang va loi: docs/shared/api.md.',
      )
      .setVersion(config.get('APP_VERSION', { infer: true }))
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
  }
}
