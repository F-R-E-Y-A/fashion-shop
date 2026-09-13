import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './common/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ProductsModule } from './modules/products/products.module.js';

/**
 * Goc cua ung dung. Moi phan he moi chi them dung mot dong vao mang imports.
 *
 * Thu tu trong tep nay khong quan trong voi Nest, nhung giu theo nhom
 * cho de doc: ha tang truoc, phan he nghiep vu sau, xep theo bang chu cai.
 */
@Module({
  imports: [
    // Mot tep .env duy nhat o goc kho ma, dung chung cho docker compose,
    // may chu API va giao dien web.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env'],
    }),
    PrismaModule,

    HealthModule,
    ProductsModule,
  ],
})
export class AppModule {}
