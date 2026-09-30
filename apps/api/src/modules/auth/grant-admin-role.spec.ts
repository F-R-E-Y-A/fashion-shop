import { describe, expect, it, vi } from 'vitest';

import type { PrismaClient } from '../../generated/prisma/client.js';
import { grantAdminRole } from './grant-admin-role.js';

/**
 * Nhanh ADMIN_ROLE_MISSING kiem o day bang Prisma gia: bai HTTP chay tren bang `roles` that do migration
 * nap va khong bi xoa giua cac bai, nen khong xoa vai ADMIN o do de thu nhanh nay.
 */
describe('grantAdminRole', () => {
  it('bao ADMIN_ROLE_MISSING va khong ghi gi khi CSDL chua co vai ADMIN (chua chay migration)', async () => {
    const createMany = vi.fn();
    const transaction = {
      role: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn() },
      userRole: { createMany },
    };
    const prisma = {
      $transaction: vi.fn((run: (tx: typeof transaction) => unknown) => run(transaction)),
    } as unknown as PrismaClient;

    await expect(grantAdminRole(prisma, 'quan.tri@example.test')).resolves.toEqual({
      outcome: 'ADMIN_ROLE_MISSING',
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});
