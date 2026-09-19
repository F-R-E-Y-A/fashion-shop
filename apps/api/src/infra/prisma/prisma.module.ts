import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

/**
 * Danh dau Global de moi module nghiep vu tiem thang PrismaService
 * ma khong phai khai bao lai o tung noi.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
