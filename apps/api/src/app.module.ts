import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './infra/config/env.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { AuthModule } from './modules/auth/index.js';
import { CartModule } from './modules/cart/index.js';
import { CheckoutModule } from './modules/checkout/index.js';
import { HealthModule } from './modules/health/index.js';
import { NotificationsModule } from './modules/notifications/index.js';
import { ProductsModule } from './modules/products/index.js';
import { PromotionsModule } from './modules/promotions/index.js';
import { UsersModule } from './modules/users/index.js';

/**
 * Goc cua ung dung. Moi phan he moi chi them dung MOT dong vao mang imports, va import qua index.js
 * cua phan he do (ESLint local/boundaries bao loi neu import sau vao ben trong).
 *
 * Thu tu khong quan trong voi Nest, nhung giu theo nhom cho de doc:
 * ha tang truoc, phan he nghiep vu sau, xep theo bang chu cai.
 */
@Module({
  imports: [
    // Mot tep .env duy nhat o goc kho ma, dung chung cho docker compose, may chu API va web.
    // validate: thieu hay sai bien thi dung ngay luc khoi dong, in dung ten bien.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,

    AuthModule,
    HealthModule,
    CartModule,
    CheckoutModule,
    NotificationsModule,
    ProductsModule,
    PromotionsModule,
    UsersModule,
  ],
})
export class AppModule {}
