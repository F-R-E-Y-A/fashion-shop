import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminProductsService } from './admin-products.service.js';
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';

describe('AdminProductsService - Quản trị Biến thể & Giá (Đợt 2)', () => {
  let service: AdminProductsService;
  type MockPrismaTx = {
    $queryRaw: ReturnType<typeof vi.fn>;
    product: Record<string, ReturnType<typeof vi.fn>>;
    productVariant: Record<string, ReturnType<typeof vi.fn>>;
    color: Record<string, ReturnType<typeof vi.fn>>;
    size: Record<string, ReturnType<typeof vi.fn>>;
    productImage: Record<string, ReturnType<typeof vi.fn>>;
    category?: { count: ReturnType<typeof vi.fn> };
  };
  let tx: MockPrismaTx;
  let prisma: {
    $transaction: ReturnType<typeof vi.fn>;
    color: { findMany: ReturnType<typeof vi.fn> };
    size: { findMany: ReturnType<typeof vi.fn> };
    product: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn(),
      product: {
        update: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      productVariant: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      color: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      size: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      productImage: {
        count: vi.fn(),
      },
    };

    prisma = {
      $transaction: vi.fn(async (callback: (txClient: unknown) => unknown) => callback(tx)),
      color: { findMany: vi.fn() },
      size: { findMany: vi.fn() },
      product: { findUnique: vi.fn() },
    };

    service = new AdminProductsService(prisma as unknown as PrismaService);
  });

  describe('getVariantOptions', () => {
    it('trả về danh sách màu và cỡ được sắp xếp đúng thứ tự', async () => {
      const mockColors = [{ id: 'c1', code: 'den', name: 'Đen', hex: '#000' }];
      const mockSizes = [{ id: 's1', code: 'M', sortOrder: 1 }];
      prisma.color.findMany.mockResolvedValue(mockColors);
      prisma.size.findMany.mockResolvedValue(mockSizes);

      const res = await service.getVariantOptions();
      expect(res.colors).toEqual(mockColors);
      expect(res.sizes).toEqual(mockSizes);
    });
  });

  describe('createVariant', () => {
    const validDto: CreateProductVariantDto = {
      id: '00000000-0000-4000-8000-000000000001',
      colorId: '00000000-0000-4000-8000-000000000002',
      sizeId: '00000000-0000-4000-8000-000000000003',
      sku: 'AO-THUN-DEN-M',
      listPrice: '200000.00',
      salePrice: '150000.00',
      isActive: true,
    };

    it('tạo biến thể thành công, gán isCustom=true, adminManagedFields và tính lại priceFrom', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(null);
      tx.color.findUnique.mockResolvedValue({
        id: validDto.colorId,
        code: 'den',
        name: 'Đen',
        hex: '#000',
      });
      tx.size.findUnique.mockResolvedValue({ id: validDto.sizeId, code: 'M', sortOrder: 1 });

      const mockCreated = {
        id: validDto.id,
        productId: 'p1',
        sku: validDto.sku,
        listPrice: new Prisma.Decimal('200000.00'),
        salePrice: new Prisma.Decimal('150000.00'),
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
        updatedAt: new Date('2026-11-14T10:00:00.000Z'),
        color: { code: 'den', name: 'Đen', hex: '#000' },
        size: { code: 'M' },
      };
      tx.productVariant.create.mockResolvedValue(mockCreated);
      tx.productVariant.findMany.mockResolvedValue([
        { listPrice: new Prisma.Decimal('200000.00'), salePrice: new Prisma.Decimal('150000.00') },
      ]);

      const res = await service.createVariant('p1', validDto);

      expect(res.id).toBe(validDto.id);
      expect(res.isCustom).toBe(true);
      expect(res.adminManagedFields).toEqual(['listPrice', 'salePrice', 'isActive']);
      expect(res.listPrice).toBe('200000');
      expect(res.salePrice).toBe('150000');

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { priceFrom: new Prisma.Decimal('150000.00') },
      });
    });

    it('từ chối khi salePrice > listPrice hoặc salePrice <= 0', async () => {
      await expect(
        service.createVariant('p1', { ...validDto, salePrice: '250000.00' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createVariant('p1', { ...validDto, salePrice: '-1000.00' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('xử lý idempotency: gửi lại cùng id + cùng payload trả về bản ghi hiện có', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      const existing = {
        id: validDto.id,
        productId: 'p1',
        colorId: validDto.colorId,
        sizeId: validDto.sizeId,
        sku: validDto.sku,
        listPrice: new Prisma.Decimal('200000.00'),
        salePrice: new Prisma.Decimal('150000.00'),
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
        updatedAt: new Date('2026-11-14T10:00:00.000Z'),
        color: { code: 'den', name: 'Đen', hex: '#000' },
        size: { code: 'M' },
      };
      tx.productVariant.findUnique.mockResolvedValue(existing);

      const res = await service.createVariant('p1', validDto);
      expect(res.id).toBe(validDto.id);
      expect(tx.productVariant.create).not.toHaveBeenCalled();
    });

    it('xử lý idempotency: gửi lại cùng id nhưng khác payload ném 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      const existing = {
        id: validDto.id,
        productId: 'p1',
        colorId: validDto.colorId,
        sizeId: validDto.sizeId,
        sku: 'SKU-KHAC',
        listPrice: new Prisma.Decimal('200000.00'),
        salePrice: new Prisma.Decimal('150000.00'),
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
        updatedAt: new Date('2026-11-14T10:00:00.000Z'),
        color: { code: 'den', name: 'Đen', hex: '#000' },
        size: { code: 'M' },
      };
      tx.productVariant.findUnique.mockResolvedValue(existing);

      await expect(service.createVariant('p1', validDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'IDEMPOTENCY_PAYLOAD_MISMATCH' }),
        }),
      );
    });

    it('chặn trùng SKU toàn cục bằng 409 SKU_EXISTS', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique
        .mockResolvedValueOnce(null) // id check
        .mockResolvedValueOnce({ id: 'other-id', sku: validDto.sku }); // sku check

      await expect(service.createVariant('p1', validDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'SKU_EXISTS' }),
        }),
      );
    });

    it('chặn trùng tổ hợp màu/cỡ bằng 409 COMBINATION_EXISTS', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique
        .mockResolvedValueOnce(null) // id check
        .mockResolvedValueOnce(null) // sku check
        .mockResolvedValueOnce({ id: 'combo-id' }); // combo check

      await expect(service.createVariant('p1', validDto)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'COMBINATION_EXISTS' }),
        }),
      );
    });
  });

  describe('updateVariant', () => {
    const updatedAt = new Date('2026-11-14T10:00:00.000Z');
    const existingVariant = {
      id: 'v1',
      productId: 'p1',
      sku: 'AO-THUN-DEN-M',
      listPrice: new Prisma.Decimal('200000.00'),
      salePrice: new Prisma.Decimal('150000.00'),
      isActive: true,
      isCustom: false,
      adminManagedFields: [],
      updatedAt,
      color: { code: 'den', name: 'Đen', hex: '#000' },
      size: { code: 'M' },
    };

    it('thất bại CAS nếu expectedUpdatedAt lệch thời gian -> 409 CONCURRENT_MODIFICATION', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);

      const input: UpdateProductVariantDto = {
        listPrice: '220000.00',
        expectedUpdatedAt: '2026-11-14T09:00:00.000Z',
      };

      await expect(service.updateVariant('p1', 'v1', input)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'CONCURRENT_MODIFICATION' }),
        }),
      );
    });

    it('xử lý No-op: dữ liệu gửi lên trùng dữ liệu hiện tại -> trả về kết quả không cập nhật DB', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);

      const input: UpdateProductVariantDto = {
        listPrice: '200000.00',
        salePrice: '150000.00',
        isActive: true,
        expectedUpdatedAt: updatedAt.toISOString(),
      };

      const res = await service.updateVariant('p1', 'v1', input);
      expect(res.id).toBe('v1');
      expect(tx.productVariant.update).not.toHaveBeenCalled();
    });

    it('chặn tắt biến thể cuối cùng khi sản phẩm đang mở bán -> 422 LAST_ACTIVE_VARIANT_BLOCKED', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);
      tx.productVariant.count.mockResolvedValue(1); // chỉ còn 1 biến thể active

      const input: UpdateProductVariantDto = {
        isActive: false,
        expectedUpdatedAt: updatedAt.toISOString(),
      };

      await expect(service.updateVariant('p1', 'v1', input)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'LAST_ACTIVE_VARIANT_BLOCKED' }),
        }),
      );
    });

    it('cho phép tắt biến thể cuối cùng nếu sản phẩm đã ngừng bán (product.isActive: false)', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: false, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);
      tx.productVariant.count.mockResolvedValue(1);

      const mockUpdated = {
        ...existingVariant,
        isActive: false,
        adminManagedFields: ['isActive'],
        updatedAt: new Date('2026-11-14T11:00:00.000Z'),
      };
      tx.productVariant.update.mockResolvedValue(mockUpdated);
      tx.productVariant.findMany
        .mockResolvedValueOnce([]) // active variants: 0
        .mockResolvedValueOnce([
          {
            listPrice: new Prisma.Decimal('200000.00'),
            salePrice: new Prisma.Decimal('150000.00'),
          },
        ]); // all variants

      const input: UpdateProductVariantDto = {
        isActive: false,
        expectedUpdatedAt: updatedAt.toISOString(),
      };

      const res = await service.updateVariant('p1', 'v1', input);
      expect(res.isActive).toBe(false);
      expect(res.adminManagedFields).toContain('isActive');
      // priceFrom được tính từ tất cả biến thể hiện có khi không còn biến thể active
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { priceFrom: new Prisma.Decimal('150000.00') },
      });
    });

    it('sửa giá thành công, ghi nhận vào adminManagedFields và tính lại priceFrom', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);

      const mockUpdated = {
        ...existingVariant,
        listPrice: new Prisma.Decimal('180000.00'),
        salePrice: new Prisma.Decimal('120000.00'),
        adminManagedFields: ['listPrice', 'salePrice'],
        updatedAt: new Date('2026-11-14T11:00:00.000Z'),
      };
      tx.productVariant.update.mockResolvedValue(mockUpdated);
      tx.productVariant.findMany.mockResolvedValue([
        { listPrice: new Prisma.Decimal('180000.00'), salePrice: new Prisma.Decimal('120000.00') },
      ]);

      const input: UpdateProductVariantDto = {
        listPrice: '180000.00',
        salePrice: '120000.00',
        expectedUpdatedAt: updatedAt.toISOString(),
      };

      const res = await service.updateVariant('p1', 'v1', input);
      expect(res.listPrice).toBe('180000');
      expect(res.salePrice).toBe('120000');
      expect(res.adminManagedFields).toEqual(['listPrice', 'salePrice']);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { priceFrom: new Prisma.Decimal('120000.00') },
      });
    });

    it('B7: partial listPrice PATCH hạ giá niêm yết bằng giá giảm cũ phải chuẩn hóa salePrice về null và ghi xuống DB', async () => {
      tx.$queryRaw.mockResolvedValue([{ id: 'p1', isActive: true, statusVersion: 1 }]);
      tx.productVariant.findUnique.mockResolvedValue(existingVariant);

      const mockUpdated = {
        ...existingVariant,
        listPrice: new Prisma.Decimal('150000.00'),
        salePrice: null,
        adminManagedFields: ['listPrice', 'salePrice'],
        updatedAt: new Date('2026-11-14T11:00:00.000Z'),
      };
      tx.productVariant.update.mockResolvedValue(mockUpdated);
      tx.productVariant.findMany.mockResolvedValue([
        { listPrice: new Prisma.Decimal('150000.00'), salePrice: null },
      ]);

      const res = await service.updateVariant('p1', 'v1', {
        listPrice: '150000.00',
        expectedUpdatedAt: updatedAt.toISOString(),
      });

      expect(res.salePrice).toBeNull();
      expect(tx.productVariant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            listPrice: new Prisma.Decimal('150000.00'),
            salePrice: null,
          }),
        }),
      );
    });
  });

  describe('changeStatus - bảo vệ mở bán', () => {
    it('chặn mở bán sản phẩm khi có 0 biến thể active -> 422 NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: 'p1', isActive: false, adminDisabled: true, statusVersion: 1 },
      ]);
      tx.productVariant.count.mockResolvedValue(0); // 0 active variants

      await expect(
        service.changeStatus('p1', { adminDisabled: false, expectedVersion: 1 }),
      ).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ error: 'NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT' }),
        }),
      );
    });

    it('cho phép mở bán khi sản phẩm có ít nhất 1 biến thể active', async () => {
      tx.$queryRaw.mockResolvedValue([
        { id: 'p1', isActive: false, adminDisabled: true, statusVersion: 1 },
      ]);
      tx.productVariant.count.mockResolvedValue(2);
      tx.productImage.count.mockResolvedValue(1);
      tx.product.update.mockResolvedValue({
        id: 'p1',
        name: 'Ao thun',
        isActive: true,
        adminDisabled: false,
        statusVersion: 2,
      });

      const res = await service.changeStatus('p1', { adminDisabled: false, expectedVersion: 1 });
      expect(res.isActive).toBe(true);
      expect(res.adminDisabled).toBe(false);
    });
  });

  describe('Regression review-127 (B1, B2, B3, B6)', () => {
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

    it('B1 cả hai DTO phải từ chối salePrice không phải tiền hợp lệ', async () => {
      for (const bad of ['not-money', 'NaN', 'Infinity', '0.001', 123, {}]) {
        const a = await validate(
          plainToInstance(CreateProductVariantDto, { ...input, salePrice: bad }),
        );
        const b = await validate(
          plainToInstance(UpdateProductVariantDto, {
            salePrice: bad as unknown as string,
            expectedUpdatedAt: new Date().toISOString(),
          }),
        );
        expect(a.some((e) => e.property === 'salePrice')).toBe(true);
        expect(b.some((e) => e.property === 'salePrice')).toBe(true);
      }
    });

    it('B2 listPrice bằng salePrice phải chuẩn hóa về null trên POST', async () => {
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'p1',
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
        },
      ]);
      tx.category = { count: vi.fn().mockResolvedValue(0) };
      tx.productVariant.findUnique.mockResolvedValue(null);
      tx.productVariant.findMany.mockResolvedValue([]);
      tx.color.findUnique.mockResolvedValue({ id });
      tx.size.findUnique.mockResolvedValue({ id });
      tx.productVariant.create.mockResolvedValue({
        id,
        productId: 'p1',
        sku: 'REVIEW-127',
        listPrice: new Prisma.Decimal('200000'),
        salePrice: null,
        isActive: true,
        isCustom: true,
        adminManagedFields: ['listPrice', 'isActive'],
        updatedAt: new Date(),
        color: { code: 'den', name: 'Đen', hex: null },
        size: { code: 'M' },
      });
      tx.product.update.mockResolvedValue({ id: 'p1' });

      await service.createVariant('p1', { ...input, salePrice: input.listPrice });
      expect(tx.productVariant.create.mock.calls[0][0].data.salePrice).toBeNull();
    });

    it('B3 xung đột unique constraint DB phải chuyển thành 409 thay vì để thoát P2002', async () => {
      tx.$queryRaw.mockResolvedValue([
        {
          id: 'p1',
          isActive: false,
          adminDisabled: true,
          statusVersion: 0,
          contentVersion: 0,
          adminContentFields: [],
        },
      ]);
      tx.category = { count: vi.fn().mockResolvedValue(0) };
      tx.color.findUnique.mockResolvedValue({ id });
      tx.size.findUnique.mockResolvedValue({ id });
      tx.productVariant.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique sku', {
          code: 'P2002',
          clientVersion: '7.10.0',
          meta: { target: ['sku'] },
        }),
      );

      const error = await service.createVariant('p1', input).catch((e) => e);
      expect(error.getStatus?.()).toBe(409);
    });

    it('B6 chuỗi giá giảm không hợp lệ phải trả về 400 thay vì uncaught Decimal exception', async () => {
      const error = await service
        .createVariant('p1', { ...input, salePrice: 'not-money' })
        .catch((e) => e);
      expect(error.getStatus?.()).toBe(400);
    });
  });
});
