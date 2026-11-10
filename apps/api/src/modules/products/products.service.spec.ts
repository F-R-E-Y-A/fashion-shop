import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

const row = (
  overrides: Partial<{
    priceFrom: { toString(): string };
    images: Array<{ url: string }>;
    variants: Array<{ listPrice: Prisma.Decimal; salePrice: Prisma.Decimal | null }>;
  }> = {},
) => ({
  id: 'p-1',
  name: 'Ao thun co tron basic',
  slug: 'ao-thun-co-tron-basic',
  description: null,
  category: { name: 'Ao', slug: 'ao' },
  brand: null,
  variants: [],
  priceFrom: { toString: () => '199000' },
  images: [{ url: 'https://example.test/first.jpg' }],
  ...overrides,
});

const cartRow = (overrides?: {
  category?: { isActive: boolean; parent?: { isActive: boolean } | null };
}) => ({
  id: 'v-1',
  productId: 'p-1',
  colorId: 'c-den',
  isActive: true,
  listPrice: { toString: () => '199000' },
  salePrice: { toString: () => '149000' },
  color: { code: 'den', name: 'Đen' },
  size: { code: 'M' },
  product: {
    slug: 'ao-thun-co-tron-basic',
    name: 'Ao thun co tron basic',
    isActive: true,
    category: {
      id: 'cat-1',
      name: 'Áo',
      slug: 'ao',
      isActive: overrides?.category?.isActive ?? true,
      parent: overrides?.category?.parent !== undefined ? overrides.category.parent : null,
    },
    images: [
      { colorId: null, url: 'https://example.test/common.jpg' },
      { colorId: 'c-den', url: 'https://example.test/black.jpg' },
    ],
  },
});

function makePrisma() {
  const prisma = {
    product: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    productVariant: { findMany: vi.fn() },
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
  };
  const inventory = {
    getStockStatuses: vi.fn(async () => new Map()),
    getAvailableQuantities: vi.fn(async () => new Map()),
  };
  return {
    prisma,
    service: new ProductsService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    ),
  };
}

const query = (overrides: Partial<ListProductsQuery> = {}): ListProductsQuery =>
  Object.assign(new ListProductsQuery(), overrides);

describe('ProductsService (UC-03.1 catalog)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: ProductsService;

  beforeEach(() => {
    ({ prisma, service } = makePrisma());
  });

  it('UC-03.1/AC3 gia la price_from dang chuoi, anh la anh dau theo sort_order', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([row({ priceFrom: { toString: () => '149000' } })]);

    const result = await service.list(query());

    expect(result.items[0]).toMatchObject({
      price: '149000',
      imageUrl: 'https://example.test/first.jpg',
    });
    // Include biến thể đang bán để biết có giá gạch ngang hay không.
    const args = prisma.product.findMany.mock.calls[0]?.[0] as { include: object };
    expect(args.include).toHaveProperty('variants');
  });

  it('UC-03.1/AC3 hiện giá niêm yết khi biến thể rẻ nhất đang giảm', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([
      row({
        priceFrom: new Prisma.Decimal('149000'),
        variants: [
          { listPrice: new Prisma.Decimal('199000'), salePrice: new Prisma.Decimal('149000') },
        ],
      }),
    ]);
    const result = await service.list(query());
    expect(result.items[0]).toMatchObject({ price: '149000', listPrice: '199000' });
  });

  it('UC-03.1/AC2 excludes inactive products and products without an active variant', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);

    await service.list(query({ search: 'AO' }));

    const args = prisma.product.findMany.mock.calls[0]?.[0] as { where: unknown };
    expect(args.where).toMatchObject({
      isActive: true,
      variants: { some: { isActive: true } },
      images: { some: {} },
      name: { contains: 'AO', mode: 'insensitive' },
    });
  });

  it('requires a real image before a product can appear in the storefront', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([row()]);

    const result = await service.list(query());

    expect(result.items[0]?.imageUrl).toBe('https://example.test/first.jpg');
    const args = prisma.product.findMany.mock.calls[0]?.[0] as {
      include: { images: unknown };
      where: { images: unknown };
    };
    // take 12 (khong con la 2): du anh de chon anh theo ho mau dang loc, xem LOG 11/10.
    expect(args.include.images).toMatchObject({ orderBy: { sortOrder: 'asc' }, take: 12 });
    expect(args.where.images).toEqual({ some: {} });
  });

  it('UC-03.4/AC2 returns NotFound for a non-sellable product detail', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findBySlug('khong-co')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: 'khong-co',
          isActive: true,
          variants: { some: { isActive: true } },
          images: { some: {} },
        }),
      }),
    );
  });

  it('Issue #7: returns null for a missing variant and skips a query for an empty cart', async () => {
    prisma.productVariant.findMany.mockResolvedValue([]);

    await expect(service.getVariantForCart('missing')).resolves.toBeNull();
    await expect(service.getVariantsForCart([])).resolves.toEqual([]);
    expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['missing'] } } }),
    );
  });

  it('Issue #7: reads sale price and matching color image for the cart contract', async () => {
    prisma.productVariant.findMany.mockResolvedValue([cartRow()]);

    await expect(service.getVariantForCart('v-1')).resolves.toEqual({
      variantId: 'v-1',
      productId: 'p-1',
      productSlug: 'ao-thun-co-tron-basic',
      name: 'Ao thun co tron basic',
      variantLabel: 'M / Đen',
      price: '149000',
      imageUrl: 'https://example.test/black.jpg',
      isActive: true,
    });
  });

  it('Issue #7: preserves cart order and reports inactive products and variants', async () => {
    const first = cartRow();
    const defaultVariant = {
      ...cartRow(),
      id: 'v-2',
      isActive: false,
      salePrice: null,
      color: { code: 'mac-dinh', name: 'Mặc định' },
      size: { code: 'FREE' },
      product: {
        ...cartRow().product,
        isActive: false,
        images: [{ colorId: null, url: 'https://example.test/common.jpg' }],
      },
    };
    prisma.productVariant.findMany.mockResolvedValue([first, defaultVariant]);

    const result = await service.getVariantsForCart(['v-2', 'missing', 'v-1']);

    expect(result.map((item) => item.variantId)).toEqual(['v-2', 'v-1']);
    expect(result[0]).toMatchObject({
      variantLabel: '',
      price: '199000',
      imageUrl: 'https://example.test/common.jpg',
      isActive: false,
    });
    expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
  });

  it('UC-04.1/AC5 reports cart variant as inactive when its category or parent is inactive', async () => {
    const activeRow = cartRow({ category: { isActive: true, parent: null } });
    const hiddenCategoryRow = {
      ...cartRow({ category: { isActive: false, parent: null } }),
      id: 'v-hidden-cat',
    };
    const hiddenParentRow = {
      ...cartRow({ category: { isActive: true, parent: { isActive: false } } }),
      id: 'v-hidden-parent',
    };
    prisma.productVariant.findMany.mockResolvedValue([
      activeRow,
      hiddenCategoryRow,
      hiddenParentRow,
    ]);

    const result = await service.getVariantsForCart(['v-1', 'v-hidden-cat', 'v-hidden-parent']);

    expect(result).toHaveLength(3);
    expect(result[0]?.isActive).toBe(true);
    expect(result[1]?.isActive).toBe(false);
    expect(result[2]?.isActive).toBe(false);
  });
});
