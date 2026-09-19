import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../config/env.js';

/**
 * Mot cho duy nhat mo ket noi toi co so du lieu.
 *
 * Prisma 7 khong tu doc DATABASE_URL trong schema nua, ma nhan mot adapter o ham khoi tao.
 * Adapter o day la PrismaPg, chay tren bo gom ket noi cua goi pg. DATABASE_URL da duoc kiem
 * luc khoi dong (infra/config/env.ts) nen o day khong can kiem lai.
 *
 * Moi module nghiep vu deu tiem lop nay vao SERVICE cua minh. Controller khong duoc tiem.
 * Khong module nao duoc tu tao PrismaClient rieng.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
    });
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
