import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminInventoryService } from './admin-inventory.service.js';

function setup() {
  const variant = {
    id: 'v1',
    sku: 'TEST-SKU',
    product: { name: 'Áo thử nghiệm' },
    color: { name: 'Đen' },
    size: { code: 'M' },
    inventory: { quantityOnHand: 10 },
  };
  const tx = {
    productVariant: {
      findMany: vi.fn().mockResolvedValue([variant]),
      count: vi.fn().mockResolvedValue(1),
      findUnique: vi.fn().mockResolvedValue(variant),
    },
    inventoryReservation: {
      groupBy: vi.fn().mockResolvedValue([{ productVariantId: 'v1', _sum: { quantity: 3 } }]),
    },
    stockMovement: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)) };
  return {
    variant,
    tx,
    prisma,
    service: new AdminInventoryService(prisma as unknown as PrismaService),
  };
}
describe('UC-13.1 quản trị tồn chỉ đọc', () => {
  it('UC-13.1/AC2 giữ snapshot, chỉ tính hold còn hiệu lực, khả dụng=tồn-giữ', async () => {
    const { service, tx, prisma } = setup();
    const data = await service.list({ page: 2, pageSize: 12 });
    expect(data.items[0]).toMatchObject({
      quantityOnHand: 10,
      reservedQuantity: 3,
      availableQuantity: 7,
    });
    expect(tx.inventoryReservation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          releasedAt: null,
          expiresAt: { gt: new Date(data.asOf) },
        }),
      }),
    );
    expect(tx.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 12, take: 12, orderBy: [{ sku: 'asc' }, { id: 'asc' }] }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
  it('UC-13.1/AC2 thiếu tồn là null; không tự tạo tồn và không trả khả dụng âm', async () => {
    const { service, tx, variant } = setup();
    tx.productVariant.findMany.mockResolvedValue([{ ...variant, inventory: null }] as never);
    expect((await service.list({ page: 1, pageSize: 12 })).items[0]).toMatchObject({
      quantityOnHand: null,
      availableQuantity: null,
    });
    tx.productVariant.findMany.mockResolvedValue([
      { ...variant, inventory: { quantityOnHand: 1 } },
    ]);
    expect((await service.list({ page: 1, pageSize: 12 })).items[0]?.availableQuantity).toBe(0);
  });
  it('UC-13.1/AC3 lịch sử phân trang ổn định và chỉ trả allowlist', async () => {
    const { service, tx } = setup();
    tx.stockMovement.findMany.mockResolvedValue([
      {
        id: 'm1',
        movementType: 'SALE',
        quantityDelta: -2,
        createdAt: new Date('2026-11-10T01:00:00Z'),
      },
    ] as never);
    const data = await service.detail('v1', { page: 2, pageSize: 12 });
    expect(data.movements.items[0]).toEqual({
      id: 'm1',
      movementType: 'SALE',
      quantityDelta: -2,
      createdAt: '2026-11-10T01:00:00.000Z',
    });
    expect(tx.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productVariantId: 'v1' },
        skip: 12,
        take: 12,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
  it('UC-13.1/AC1 biến thể không tồn tại trả404', async () => {
    const { service, tx } = setup();
    tx.productVariant.findUnique.mockResolvedValue(null);
    await expect(service.detail('missing', { page: 1, pageSize: 12 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
  });
});
