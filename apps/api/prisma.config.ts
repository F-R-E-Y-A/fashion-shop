// Prisma 7 doc cau hinh tu tep nay thay vi tu khoi datasource trong schema.
// Chi cac lenh dong lenh nhu migrate, db push, studio, seed moi dung tep nay.
// Luc ung dung chay that thi PrismaClient nhan adapter, xem src/common/prisma/prisma.service.ts.
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Mot tep .env duy nhat o goc kho ma, dung chung cho ca ba noi.
loadEnv({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
