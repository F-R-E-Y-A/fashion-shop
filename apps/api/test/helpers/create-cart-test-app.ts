import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';

import { configureApp } from '../../src/app.setup.js';
import { validateEnv } from '../../src/infra/config/env.js';
import { PrismaService } from '../../src/infra/prisma/prisma.service.js';
import { AuthGuard } from '../../src/modules/auth/index.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { CartController } from '../../src/modules/cart/cart.controller.js';
import { CartService } from '../../src/modules/cart/cart.service.js';
import { OptionalAuthGuard } from '../../src/modules/cart/optional-auth.guard.js';
import { InventoryService } from '../../src/modules/inventory/index.js';
import { CatalogEventsService } from '../../src/modules/products/catalog-events.service.js';
import { ProductsService } from '../../src/modules/products/index.js';
import { ProductsController } from '../../src/modules/products/products.controller.js';
import { CatalogSearchService } from '../../src/modules/products/search/catalog-search.service.js';
import { SearchDictionaryService } from '../../src/modules/products/search/search-dictionary.service.js';

/** Cart + PostgreSQL + JWT that; khong khoi dong Redis/SMTP hay tao phien auth ngoai pham vi test. */
export async function createCartTestApp(): Promise<{
  app: INestApplication;
  http: ReturnType<typeof supertest>;
  prisma: PrismaService;
  tokens: TokenService;
}> {
  const config = new ConfigService(validateEnv(process.env));
  const module = await Test.createTestingModule({
    controllers: [CartController, ProductsController],
    providers: [
      CartService,
      ProductsService,
      InventoryService,
      CatalogEventsService,
      CatalogSearchService,
      SearchDictionaryService,
      OptionalAuthGuard,
      AuthGuard,
      PrismaService,
      TokenService,
      { provide: ConfigService, useValue: config },
      {
        provide: JwtService,
        useValue: new JwtService({ secret: config.get('JWT_ACCESS_SECRET') }),
      },
    ],
  }).compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  await app.listen(0, '127.0.0.1');
  return {
    app,
    http: supertest(app.getHttpServer()),
    prisma: app.get(PrismaService),
    tokens: app.get(TokenService),
  };
}
