import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import type { ImportProductRow } from './import/import.types.js';
import { ProductsService } from './products.service.js';

describe('ProductsService - Import Bảo vệ Biến thể & Cặp giá (Đợt 2)', () => {
  let service: ProductsService;
  type MockPrismaTx = {
    $queryRaw: ReturnType<typeof vi.fn>;
    category: Record<string, ReturnType<typeof vi.fn>>;
    color: Record<string, ReturnType<typeof vi.fn>>;
    size: Record<string, ReturnType<typeof vi.fn>>;
    product: Record<string, ReturnType<typeof vi.fn>>;
    productVariant: Record<string, ReturnType<typeof vi.fn>>;
    productImage: Record<string, ReturnType<typeof vi.fn>>;
  };
  let tx: MockPrismaTx;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      category: { findFirst: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      color: { upsert: vi.fn(), findMany: vi.fn() },
      size: { findMany: vi.fn() },
      product: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn(),
      },
      productImage: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    prisma = {
      $transaction: vi.fn(async (callback: (txClient: MockPrismaTx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    service = new ProductsService(
      prisma as unknown as PrismaService,
      {} as unknown as InventoryService,
    );
  });

  const baseRow: ImportProductRow = {
    sourceKey: 'src-1',
    name: 'Áo thun phong cách',
    categorySlug: 'ao-thun',
    images: [{ url: 'https://example.test/img1.jpg' }],
    variants: [
      {
        sku: 'AT-DEN-M',
        color: { code: 'den', name: 'Đen' },
        sizeCode: 'M',
        listPrice: '200000.00',
        salePrice: '150000.00',
      },
    ],
  };

  function setupMocks() {
    tx.$queryRaw.mockResolvedValue([
      {
        id: 'cat-1',
        slug: 'ao-thun',
        isActive: true,
        adminDisabled: false,
        statusVersion: 0,
        contentVersion: 0,
        adminContentFields: [],
      },
    ]);
    tx.color.upsert.mockResolvedValue({ id: 'color-1', code: 'den' });
    tx.size.findMany.mockResolvedValue([{ id: 'size-1', code: 'M' }]);
    tx.product.findFirst.mockResolvedValue(null);
    tx.product.create.mockResolvedValue({
      id: 'prod-1',
      name: baseRow.name,
      slug: 'ao-thun-phong-cach',
      isActive: true,
    });
    tx.product.update.mockResolvedValue({
      id: 'prod-1',
      name: baseRow.name,
      slug: 'ao-thun-phong-cach',
      isActive: true,
    });
    tx.productVariant.findMany.mockResolvedValue([
      {
        productId: 'prod-1',
        listPrice: new Prisma.Decimal('200000.00'),
        salePrice: new Prisma.Decimal('150000.00'),
      },
    ]);
  }

  it('xung đột cặp giá: admin giữ salePrice=180k, import hạ listPrice=150k -> giữ nguyên cả cặp giá hiện có trong DB', async () => {
    setupMocks();

    const existingVariant = {
      id: 'v1',
      productId: 'prod-1',
      colorId: 'color-1',
      sizeId: 'size-1',
      sku: 'AT-DEN-M',
      listPrice: new Prisma.Decimal('250000.00'),
      salePrice: new Prisma.Decimal('180000.00'),
      isActive: true,
      adminManagedFields: ['salePrice'], // admin quản lý giá giảm 180k
    };
    tx.productVariant.findUnique.mockResolvedValue(existingVariant);

    const conflictingRow: ImportProductRow = {
      ...baseRow,
      variants: [
        {
          sku: 'AT-DEN-M',
          color: { code: 'den', name: 'Đen' },
          sizeCode: 'M',
          listPrice: '150000.00', // nguồn hạ listPrice xuống 150k < 180k
          salePrice: undefined,
        },
      ],
    };

    await service.importProducts([conflictingRow]);

    // Không được xóa salePrice hoặc lưu salePrice (180k) > listPrice (150k)
    // Phải giữ nguyên cả cặp giá hiện có trong DB (listPrice: 250k, salePrice: 180k)
    expect(tx.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sku: 'AT-DEN-M' },
        data: expect.objectContaining({
          listPrice: new Prisma.Decimal('250000.00'),
          salePrice: new Prisma.Decimal('180000.00'),
        }),
      }),
    );
  });

  it('xung đột cặp giá: admin giữ listPrice=200k, import đưa salePrice=250k -> giữ nguyên cả cặp giá hiện có trong DB', async () => {
    setupMocks();

    const existingVariant = {
      id: 'v1',
      productId: 'prod-1',
      colorId: 'color-1',
      sizeId: 'size-1',
      sku: 'AT-DEN-M',
      listPrice: new Prisma.Decimal('200000.00'),
      salePrice: new Prisma.Decimal('160000.00'),
      isActive: true,
      adminManagedFields: ['listPrice'], // admin quản lý giá niêm yết 200k
    };
    tx.productVariant.findUnique.mockResolvedValue(existingVariant);

    const conflictingRow: ImportProductRow = {
      ...baseRow,
      variants: [
        {
          sku: 'AT-DEN-M',
          color: { code: 'den', name: 'Đen' },
          sizeCode: 'M',
          listPrice: '300000.00',
          salePrice: '250000.00', // nguồn đưa salePrice 250k > 200k
        },
      ],
    };

    await service.importProducts([conflictingRow]);

    expect(tx.productVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sku: 'AT-DEN-M' },
        data: expect.objectContaining({
          listPrice: new Prisma.Decimal('200000.00'),
          salePrice: new Prisma.Decimal('160000.00'),
        }),
      }),
    );
  });

  it('không tắt biến thể tạo tay (isCustom: true) hoặc biến thể do admin quản lý isActive', async () => {
    setupMocks();
    tx.productVariant.findUnique.mockResolvedValue(null);

    await service.importProducts([baseRow]);

    // Kiểm tra câu lệnh updateMany tắt biến thể thiếu trong nguồn phải bảo vệ isCustom và adminManagedFields
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: {
        productId: 'prod-1',
        sku: { notIn: ['AT-DEN-M'] },
        isCustom: false,
        NOT: { adminManagedFields: { has: 'isActive' } },
      },
      data: { isActive: false },
    });
  });

  it.each([
    { wasActive: true, versionUpdate: { increment: 1 } },
    { wasActive: false, versionUpdate: undefined },
  ])(
    'UC-04.2/AC13 UC-04.3/AC38 tính version theo trạng thái cuối khi hết biến thể hoạt động (isActive cũ: $wasActive)',
    async ({ wasActive, versionUpdate }) => {
      setupMocks();
      tx.$queryRaw.mockResolvedValueOnce([{ id: 'cat-1' }]).mockResolvedValueOnce([
        {
          id: 'prod-1',
          isActive: wasActive,
          adminDisabled: false,
          statusVersion: 7,
          contentVersion: 0,
          adminContentFields: [],
        },
      ]);
      const managedVariant = {
        productId: 'prod-1',
        colorId: 'color-1',
        sizeId: 'size-1',
        listPrice: new Prisma.Decimal('200000'),
        salePrice: null,
        isActive: false,
        adminManagedFields: ['isActive'],
      };
      tx.productVariant.findUnique.mockResolvedValue(managedVariant);
      tx.productVariant.findMany
        .mockResolvedValueOnce([{ productId: 'prod-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([managedVariant]);

      const [result] = await service.importProducts([baseRow]);

      expect(result?.status).toBe('updated');
      const statusWrites = tx.product.update.mock.calls
        .map(([{ data }]) => ({ isActive: data.isActive, statusVersion: data.statusVersion }))
        .filter(
          ({ isActive, statusVersion }) => isActive !== undefined || statusVersion !== undefined,
        );
      expect(statusWrites).toEqual([{ isActive: false, statusVersion: versionUpdate }]);
    },
  );

  it('UC-04.3/AC38 báo xung đột màu/cỡ với biến thể tạo tay và tiếp tục batch', async () => {
    setupMocks();
    tx.size.findMany.mockResolvedValue([
      { id: 'size-1', code: 'M' },
      { id: 'size-2', code: 'L' },
    ]);
    tx.productVariant.findUnique
      .mockResolvedValueOnce({
        productId: 'prod-1',
        colorId: 'color-1',
        sizeId: 'size-1',
        listPrice: new Prisma.Decimal('200000'),
        salePrice: null,
        isActive: true,
        adminManagedFields: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    tx.productVariant.findMany
      .mockResolvedValueOnce([{ productId: 'prod-1' }])
      .mockResolvedValueOnce([]);
    tx.productVariant.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique product/color/size', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['product_id', 'color_id', 'size_id'] },
      }),
    );
    const conflictingRow: ImportProductRow = {
      ...baseRow,
      variants: [
        ...baseRow.variants,
        { ...baseRow.variants[0]!, sku: 'AT-NGUON-L', sizeCode: 'L' },
      ],
    };
    const nextRow: ImportProductRow = {
      ...baseRow,
      sourceKey: 'src-2',
      variants: [{ ...baseRow.variants[0]!, sku: 'AT-TIEP-THEO-M' }],
    };

    const results = await service.importProducts([conflictingRow, nextRow]);

    expect(results).toMatchObject([
      {
        sourceKey: 'src-1',
        status: 'failed',
        reason: 'SKU_CONFLICT',
        detail: expect.stringContaining('AT-NGUON-L'),
      },
      { sourceKey: 'src-2', status: 'created' },
    ]);
    expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
  });

  describe('Regression review-127 (B4, B5)', () => {
    const id = '00000000-0000-4000-8000-000000000127';
    const input = {
      id,
      colorId: id,
      sizeId: id,
      sku: 'REVIEW-127',
      listPrice: '200000',
      salePrice: null,
      isActive: true,
    };
    const existing = {
      id,
      productId: 'p1',
      colorId: 'old-color',
      sizeId: 'old-size',
      sku: input.sku,
      listPrice: new Prisma.Decimal('250000'),
      salePrice: new Prisma.Decimal('180000'),
      isActive: false,
      isCustom: true,
      adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      color: { code: 'old', name: 'Old', hex: null },
      size: { code: 'OLD' },
    };
    const row = {
      sourceKey: 'src-review',
      name: 'Áo thun review',
      categorySlug: 'ao-thun',
      images: [{ url: 'https://example.test/image.jpg' }],
      variants: [
        {
          sku: input.sku,
          color: { code: 'new', name: 'New' },
          sizeCode: 'M',
          listPrice: '150000',
        },
      ],
    };

    it('B4 import không được phép ghi đè định danh màu/cỡ của SKU đã tồn tại', async () => {
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'p1',
          slug: 'ao-thun',
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
        },
      ]);
      tx.category.count.mockResolvedValue(0);
      tx.product.update.mockResolvedValue({ id: 'p1', slug: 'ao-thun' });
      tx.product.create.mockResolvedValue({ id: 'p1', slug: 'ao-thun' });
      tx.color.upsert.mockResolvedValue({ id: 'new-color' });
      tx.size.findMany.mockResolvedValue([{ id: 'new-size', code: 'M' }]);
      tx.productVariant.findMany
        .mockResolvedValueOnce([{ productId: 'p1' }])
        .mockResolvedValueOnce([existing]);
      tx.productVariant.findUnique.mockResolvedValue(existing);

      const result = await service.importProducts([row]);
      expect(result[0]?.status).toBe('failed');
      expect(tx.productVariant.update).not.toHaveBeenCalled();
    });

    it('B5 import priceFrom fallback phải dùng giá bảo lưu trong DB khi mọi biến thể đều inactive', async () => {
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'p1',
          slug: 'ao-thun',
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
        },
      ]);
      tx.category.count.mockResolvedValue(0);
      tx.product.update.mockResolvedValue({ id: 'p1', slug: 'ao-thun' });
      tx.product.create.mockResolvedValue({ id: 'p1', slug: 'ao-thun' });
      tx.color.upsert.mockResolvedValue({ id: 'new-color' });
      tx.size.findMany.mockResolvedValue([{ id: 'new-size', code: 'M' }]);
      const existingB5 = { ...existing, colorId: 'new-color', sizeId: 'new-size' };
      tx.productVariant.findMany
        .mockResolvedValueOnce([{ productId: 'p1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([existingB5]);
      tx.productVariant.findUnique.mockResolvedValue(existingB5);

      await service.importProducts([row]);
      const updates = tx.product.update.mock.calls.map(
        (c: unknown) => (c as [{ data: Record<string, unknown> }])[0].data,
      );
      const priceUpdates = updates.filter((x) => x.priceFrom !== undefined);
      expect(String(priceUpdates.at(-1)?.priceFrom)).toBe('180000');
    });
  });

  describe('Bảo vệ bộ ảnh qua Import (Đợt 3, UC-04.2/AC48)', () => {
    it('UC-04.2/AC48 khi imagesManagedByAdmin = true: import giữ nguyên bộ ảnh và thứ tự của admin (kể cả khi nguồn trả images: []), và tính isActive theo số ảnh thực tế còn trong DB', async () => {
      setupMocks();
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'prod-1',
          slug: 'ao-thun-phong-cach',
          isActive: true,
          adminDisabled: false,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
          imagesVersion: 2,
          imagesManagedByAdmin: true,
        },
      ]);
      tx.productVariant.findMany
        .mockResolvedValueOnce([{ productId: 'prod-1' }])
        .mockResolvedValueOnce([
          {
            productId: 'prod-1',
            listPrice: new Prisma.Decimal('200000.00'),
            salePrice: new Prisma.Decimal('150000.00'),
          },
        ]);
      tx.productImage.count = vi.fn().mockResolvedValue(3); // admin vẫn còn 3 ảnh trong DB

      const emptyImagesRow: ImportProductRow = {
        ...baseRow,
        images: [], // Nguồn rỗng ảnh
      };

      await service.importProducts([emptyImagesRow]);

      // Không được ghi đè hoặc xóa ảnh của admin
      expect(tx.productImage.upsert).not.toHaveBeenCalled();
      expect(tx.productImage.deleteMany).not.toHaveBeenCalled();

      // Sản phẩm vẫn giữ isActive: true vì admin còn 3 ảnh trong DB
      expect(tx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('UC-04.2/AC48 khi imagesManagedByAdmin = false: import làm thay đổi bộ ảnh sẽ tăng imagesVersion để vô hiệu hóa token CAS cũ; import lặp không đổi ảnh thì không tăng imagesVersion', async () => {
      setupMocks();
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'prod-1',
          slug: 'ao-thun-phong-cach',
          isActive: true,
          adminDisabled: false,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
          imagesVersion: 1,
          imagesManagedByAdmin: false,
        },
      ]);
      tx.productVariant.findMany
        .mockResolvedValueOnce([{ productId: 'prod-1' }])
        .mockResolvedValueOnce([
          {
            productId: 'prod-1',
            listPrice: new Prisma.Decimal('200000.00'),
            salePrice: new Prisma.Decimal('150000.00'),
          },
        ]);
      tx.productImage.findMany = vi.fn().mockResolvedValue([
        {
          id: 'old-img-1',
          url: 'https://example.test/old.jpg',
          alt: null,
          colorId: null,
          sortOrder: 0,
        },
      ]);

      await service.importProducts([baseRow]);

      expect(tx.productImage.upsert).toHaveBeenCalled();
      expect(tx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prod-1' },
          data: expect.objectContaining({
            imagesVersion: { increment: 1 },
          }),
        }),
      );
    });
  });
});
