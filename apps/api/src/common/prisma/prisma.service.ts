import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Mot cho duy nhat mo ket noi toi co so du lieu.
 *
 * Prisma 7 khong tu doc DATABASE_URL trong schema nua, ma nhan mot adapter
 * o ham khoi tao. Adapter o day la PrismaPg, chay tren bo gom ket noi cua goi pg.
 *
 * Moi module nghiep vu deu tiem lop nay vao service cua minh.
 * Khong module nao duoc tu tao PrismaClient rieng.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');

    if (!connectionString) {
      throw new Error(
        'Thieu bien moi truong DATABASE_URL. Chep .env.example thanh .env roi thu lai.',
      );
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Da ket noi co so du lieu');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Da dong ket noi co so du lieu');
  }
}
