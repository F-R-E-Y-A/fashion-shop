import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminProductsService } from './admin-products.service.js';
import { ListAdminProductsQuery } from './dto/list-admin-products.query.js';

function setup() {
  const prisma = {
    product: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((tasks: unknown[]) => Promise.all(tasks)),
  };
  return { prisma, service: new AdminProductsService(prisma as unknown as PrismaService) };
}
const query = (input = {}) => Object.assign(new ListAdminProductsQuery(), input);

describe('UC-04.2 admin catalog chỉ đọc', () => {
  it('UC-04.2/AC2 all không áp điều kiện storefront; inactive chỉ theo cờ sản phẩm', async () => {
    const { prisma, service } = setup();
    await service.list(query());
    expect(prisma.product.count).toHaveBeenLastCalledWith({ where: {} });
    await service.list(query({ status: 'inactive' }));
    expect(prisma.product.count).toHaveBeenLastCalledWith({ where: { isActive: false } });
    await service.list(query({ status: 'active' }));
    expect(prisma.product.count).toHaveBeenLastCalledWith({ where: { isActive: true } });
  });

  it('UC-04.2/AC3 tìm literal tên HOẶC SKU mọi biến thể; count và rows cùng where', async () => {
    const { prisma, service } = setup();
    await service.list(query({ q: 'Áo%_\\' }));
    const where = prisma.product.count.mock.calls[0]![0].where;
    expect(where).toEqual({
      OR: [
        { name: { contains: 'Áo\\%\\_\\\\', mode: 'insensitive' } },
        { variants: { some: { sku: { contains: 'Áo\\%\\_\\\\', mode: 'insensitive' } } } },
      ],
    });
    expect(prisma.product.findMany.mock.calls[0]![0].where).toBe(where);
  });

  it('UC-04.2/AC4 phân trang và phá hòa theo id', async () => {
    const { prisma, service } = setup();
    prisma.product.count.mockResolvedValue(30);
    expect(await service.list(query({ page: 2, pageSize: 12, sort: 'name_asc' }))).toMatchObject({
      page: 2,
      pageSize: 12,
      total: 30,
      totalPages: 3,
    });
    expect(prisma.product.findMany.mock.calls[0]![0]).toMatchObject({
      skip: 12,
      take: 12,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  it('UC-04.2/AC2 chi tiết mapping Decimal/null/ẩn; không trả cột ngoài allowlist', async () => {
    const { prisma, service } = setup();
    const at = new Date('2026-01-01T00:00:00Z');
    prisma.product.findUnique.mockResolvedValue({
      id: 'p',
      name: 'Áo',
      slug: 'ao',
      priceFrom: { toString: () => '100000' },
      isActive: false,
      category: { id: 'c', name: 'Áo', slug: 'ao', isActive: false },
      brand: null,
      createdAt: at,
      updatedAt: at,
      description: null,
      material: null,
      careInstructions: null,
      isFeatured: false,
      audience: null,
      attributes: { secret: true },
      images: [],
      variants: [
        {
          id: 'v',
          sku: 'SKU',
          isActive: false,
          listPrice: { toString: () => '100000' },
          salePrice: null,
          color: { code: 'den', name: 'Đen', hex: null },
          size: { code: 'M', name: 'M' },
        },
      ],
    });
    const result = await service.findById('p');
    expect(result).toMatchObject({
      priceFrom: '100000',
      isActive: false,
      imageUrl: null,
      brand: null,
      variants: [{ isActive: false, listPrice: '100000', salePrice: null }],
      images: [],
    });
    expect(result).not.toHaveProperty('attributes');
    expect(prisma.product.findUnique.mock.calls[0]![0].where).toEqual({ id: 'p' });
  });

  it('UC-04.2/AC4 id không tồn tại trả 404', async () => {
    const { service } = setup();
    await expect(service.findById('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    { q: ['a', 'b'] },
    { status: ['active', 'active'] },
    { status: 'hidden' },
    { sort: 'price' },
    { page: ['1', '1'] },
    { page: '1e2' },
    { page: '1.5' },
    { page: 'Infinity' },
    { page: '0' },
    { page: '100001' },
    { pageSize: ['12', '12'] },
    { pageSize: '61' },
    { q: 'a'.repeat(121) },
  ])('UC-04.2/AC4 DTO từ chối %j', async (raw) => {
    expect((await validate(plainToInstance(ListAdminProductsQuery, raw))).length).toBeGreaterThan(
      0,
    );
  });

  it('UC-04.2/AC4 mặc định và q trim đúng', async () => {
    const value = plainToInstance(ListAdminProductsQuery, {
      q: '  Áo  ',
      page: '2',
      pageSize: '24',
    });
    expect(await validate(value)).toEqual([]);
    expect(value).toMatchObject({ q: 'Áo', page: 2, pageSize: 24 });
  });
});
