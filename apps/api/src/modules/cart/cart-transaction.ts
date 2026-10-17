import { createHash } from 'node:crypto';

import { BadRequestException, ConflictException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';

export function cartOwnerKey(userId?: string, guestToken?: string): string {
  if (userId) return `user:${userId}`;
  if (!guestToken || !/^[A-Za-z0-9_-]{1,64}$/.test(guestToken)) {
    throw new BadRequestException('Định danh giỏ khách không hợp lệ.');
  }
  return `guest:${guestToken}`;
}

/**
 * CRUD va merge cung khoa theo chu so huu, ke ca khi gio chua ton tai. Khoa nguon va dich theo
 * thu tu co dinh de tranh deadlock; bam khoa de token khach khong di vao tham so SQL.
 */
export async function cartTransaction<T>(
  prisma: PrismaService,
  owners: string[],
  work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const keys = [...new Set(owners)]
    .sort()
    .map((owner) => createHash('sha256').update(`cart:${owner}`).digest('hex'));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          for (const key of keys) {
            await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          }
          return work(transaction);
        },
        // Moi lenh sau khi cho khoa phai doc duoc commit moi nhat cua request truoc.
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2002', 'P2034'].includes(error.code)
      ) {
        throw error;
      }
      // Retry NGOAI transaction: Postgres da abort giao dich bi unique/deadlock, khong doc lai o do.
      if (attempt >= 2) {
        throw new ConflictException('Giỏ hàng đang được cập nhật. Vui lòng thử lại.');
      }
    }
  }
}
