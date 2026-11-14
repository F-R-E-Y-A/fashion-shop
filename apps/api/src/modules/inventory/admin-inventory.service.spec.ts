import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminInventoryService } from './admin-inventory.service.js';
import { LowStockQuery } from './dto/admin-inventory.dto.js';

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
    inventory: {
      upsert: vi.fn().mockResolvedValue({ productVariantId: 'v1', quantityOnHand: 10 }),
    },
    inventoryReservation: {
      groupBy: vi.fn().mockResolvedValue([{ productVariantId: 'v1', _sum: { quantity: 3 } }]),
    },
    stockMovement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'sm1' }),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn().mockResolvedValue(1),
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

  describe('Issue #92: lowStock cảnh báo tồn thấp', () => {
    it('truy vấn phân ngưỡng và đếm toàn cục trong RepeatableRead transaction', async () => {
      const { service, tx, prisma } = setup();
      const mockItems = [
        {
          id: 'v1',
          sku: 'SKU-001',
          productName: 'Áo Thun',
          colorName: 'Đen',
          sizeCode: 'M',
          quantityOnHand: 4,
          reservedQuantity: 1,
          availableQuantity: 3,
        },
      ];
      tx.$queryRaw.mockResolvedValueOnce(mockItems).mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.lowStock({ threshold: 5, limit: 5 });

      expect(result).toMatchObject({
        items: mockItems,
        total: 1,
        threshold: 5,
      });
      expect(typeof result.asOf).toBe('string');
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('áp dụng giá trị mặc định threshold=5 và limit=5 khi không truyền', async () => {
      const { service, tx } = setup();
      tx.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.lowStock({} as LowStockQuery);

      expect(result).toEqual({
        items: [],
        total: 0,
        threshold: 5,
        asOf: expect.any(String),
      });
    });

    it('tính khả dụng=0 khi reserved vượt quá quantityOnHand (không âm) và kiểm chứng công thức SQL', async () => {
      const { service, tx } = setup();
      const mockItem = {
        id: 'v2',
        sku: 'SKU-OVERHELD',
        productName: 'Quần Jeans',
        colorName: 'Xanh',
        sizeCode: 'L',
        quantityOnHand: 2,
        reservedQuantity: 5,
        availableQuantity: 0,
      };
      tx.$queryRaw.mockResolvedValueOnce([mockItem]).mockResolvedValueOnce([{ count: '1' }]);

      const result = await service.lowStock({ threshold: 5, limit: 10 });
      expect(result.items[0]?.availableQuantity).toBe(0);
      expect(result.total).toBe(1);

      // Kiểm chứng câu truy vấn SQL được tạo bởi Prisma $queryRaw chứa đúng công thức toán học và sắp xếp
      const firstCall = tx.$queryRaw.mock.calls[0] as [
        string[] | { strings?: string[]; values?: unknown[] },
        ...unknown[],
      ];
      const queryText = (
        Array.isArray(firstCall[0])
          ? (firstCall[0] as string[]).join('?')
          : String(firstCall[0]?.strings?.join('?') ?? firstCall[0])
      ).replace(/\s+/g, ' ');
      expect(queryText).toContain('GREATEST(0, i.quantity_on_hand - COALESCE(r.reserved, 0))');
      expect(queryText).toContain(
        'WHERE GREATEST(0, i.quantity_on_hand - COALESCE(r.reserved, 0)) <=',
      );
      expect(queryText).toContain('ORDER BY "availableQuantity" ASC, pv.sku ASC, pv.id ASC');
      expect(queryText).toContain('LIMIT');

      const values = Array.isArray(firstCall[0]?.values) ? firstCall[0].values : firstCall.slice(1);
      expect(values).toEqual(expect.arrayContaining([5, 10]));
    });
  });

  describe('PH-13.2 Nhập hàng và điều chỉnh tồn kho (adjust)', () => {
    it('RECEIPT: nhập thêm hàng thành công, cộng vào tồn hiện tại và ghi StockMovement kèm reason', async () => {
      const { service, tx, prisma } = setup();

      const result = await service.adjust(
        'v1',
        {
          type: 'RECEIPT',
          quantity: 15,
          reason: 'Nhập lô hàng Yody tháng 11',
        },
        'admin-user-1',
      );

      // Khoa advisory lock truoc khi thuc hien
      expect(tx.$executeRaw).toHaveBeenCalled();

      // Cap nhat ton kho: 10 + 15 = 25
      expect(tx.inventory.upsert).toHaveBeenCalledWith({
        where: { productVariantId: 'v1' },
        create: { productVariantId: 'v1', quantityOnHand: 25 },
        update: { quantityOnHand: 25 },
      });

      // Ghi bien dong kho kem actorUserId
      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productVariantId: 'v1',
          movementType: 'RECEIPT',
          quantityDelta: 15,
          reason: 'Nhập lô hàng Yody tháng 11',
          actorUserId: 'admin-user-1',
        },
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'ReadCommitted',
      });

      expect(result).toMatchObject({
        id: 'v1',
        quantityOnHand: 25,
        reservedQuantity: 3,
        availableQuantity: 22,
      });
    });

    it('RECEIPT: nhập hàng cho biến thể chưa có bản ghi tồn (null -> quantity)', async () => {
      const { service, tx, variant } = setup();
      tx.productVariant.findUnique.mockResolvedValue({ ...variant, inventory: null });

      const result = await service.adjust('v1', {
        type: 'RECEIPT',
        quantity: 50,
        reason: 'Khởi tạo tồn kho ban đầu',
      });

      expect(tx.inventory.upsert).toHaveBeenCalledWith({
        where: { productVariantId: 'v1' },
        create: { productVariantId: 'v1', quantityOnHand: 50 },
        update: { quantityOnHand: 50 },
      });

      expect(result.quantityOnHand).toBe(50);
      expect(result.availableQuantity).toBe(47);
    });

    it('RECEIPT: từ chối số lượng <= 0', async () => {
      const { service, tx } = setup();

      await expect(
        service.adjust('v1', {
          type: 'RECEIPT',
          quantity: 0,
          reason: 'Nhập không hợp lệ',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.inventory.upsert).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('ADJUSTMENT: điều chỉnh kiểm kê tăng hoặc giảm tồn thành công', async () => {
      const { service, tx } = setup();

      // Giam ton tu 10 xuong 6 (delta = -4), dang giu la 3 nen 6 >= 3 hop le
      const result = await service.adjust('v1', {
        type: 'ADJUSTMENT',
        quantity: 6,
        reason: 'Hàng rách 4 chiếc khi kiểm kho',
      });

      expect(tx.inventory.upsert).toHaveBeenCalledWith({
        where: { productVariantId: 'v1' },
        create: { productVariantId: 'v1', quantityOnHand: 6 },
        update: { quantityOnHand: 6 },
      });

      expect(tx.stockMovement.create).toHaveBeenCalledWith({
        data: {
          productVariantId: 'v1',
          movementType: 'ADJUSTMENT',
          quantityDelta: -4,
          reason: 'Hàng rách 4 chiếc khi kiểm kho',
          actorUserId: null,
        },
      });

      expect(result).toMatchObject({
        quantityOnHand: 6,
        reservedQuantity: 3,
        availableQuantity: 3,
      });
    });

    it('ADJUSTMENT: từ chối khi số lượng kiểm kê bằng đúng tồn hiện tại (delta = 0)', async () => {
      const { service, tx } = setup();

      await expect(
        service.adjust('v1', {
          type: 'ADJUSTMENT',
          quantity: 10, // ton hien tai la 10
          reason: 'Kiểm kê không lệch',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.inventory.upsert).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('ADJUSTMENT: từ chối khi số lượng mới nhỏ hơn số lượng đang giữ (reservedQuantity)', async () => {
      const { service, tx } = setup();

      // Dang giu la 3, muon chinh ton ve 2 (nho hon 3) -> phai reject de tranh am kho
      await expect(
        service.adjust('v1', {
          type: 'ADJUSTMENT',
          quantity: 2,
          reason: 'Điều chỉnh thiếu hàng',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.inventory.upsert).not.toHaveBeenCalled();
      expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('ADJUSTMENT: cho phép điều chỉnh về đúng bằng số lượng đang giữ (available = 0)', async () => {
      const { service } = setup();

      const result = await service.adjust('v1', {
        type: 'ADJUSTMENT',
        quantity: 3, // bang dung reservedQuantity = 3
        reason: 'Giảm sát lượng đặt trước',
      });

      expect(result.quantityOnHand).toBe(3);
      expect(result.availableQuantity).toBe(0);
    });

    it('ADJUSTMENT: từ chối số lượng âm', async () => {
      const { service } = setup();

      await expect(
        service.adjust('v1', {
          type: 'ADJUSTMENT',
          quantity: -1,
          reason: 'Sai số',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối khi biến thể không tồn tại (404)', async () => {
      const { service, tx } = setup();
      tx.productVariant.findUnique.mockResolvedValue(null);

      await expect(
        service.adjust('missing-id', {
          type: 'RECEIPT',
          quantity: 10,
          reason: 'Test missing',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
