import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminProductsService } from './admin-products.service.js';
import { productStatusChange } from './product-status.js';

describe('UC-04.2 trang thai san pham', () => {
  it.each([true, false])('UC-04.2/AC12 muc tieu hold=%s va no-op/version', (disabled) => {
    const before = { isActive: disabled, adminDisabled: !disabled };
    expect(productStatusChange(before, disabled, true)).toEqual({
      isActive: !disabled,
      adminDisabled: disabled,
      statusVersion: { increment: 1 },
    });
    expect(
      productStatusChange({ isActive: !disabled, adminDisabled: disabled }, disabled, true),
    ).not.toHaveProperty('statusVersion');
    expect(productStatusChange({ isActive: false, adminDisabled: true }, false, false)).toEqual({
      isActive: false,
      adminDisabled: false,
      statusVersion: { increment: 1 },
    });
  });
  it('UC-04.2/AC11 thieu404, version cu409 truoc khi ghi, ke ca ABA', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      productImage: { count: vi.fn() },
      product: { update: vi.fn() },
    };
    const prisma = { $transaction: (fn: (tx: unknown) => unknown) => fn(tx) };
    const service = new AdminProductsService(prisma as unknown as PrismaService);
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.changeStatus('missing', { adminDisabled: true, expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    tx.$queryRaw.mockResolvedValue([{ isActive: true, adminDisabled: false, statusVersion: 2 }]);
    await expect(
      service.changeStatus('p', { adminDisabled: true, expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productImage.count).not.toHaveBeenCalled();
  });
});
