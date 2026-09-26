import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

const row = (
  overrides: Partial<{
    priceFrom: { toString(): string };
    images: Array<{ url: string }>;
  }> = {},
) => ({
  id: 'p-1',
  name: 'Ao thun co tron basic',
  slug: 'ao-thun-co-tron-basic',
  description: null,
  category: { name: 'Ao', slug: 'ao' },
  priceFrom: { toString: () => '199000' },
  images: [{ url: 'https://example.test/first.jpg' }],
  ...overrides,
});

const cartRow = () => ({
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
  return { prisma, service: new ProductsService(prisma as unknown as PrismaService) };
}

const query = (overrides: Partial<ListProductsQuery> = {}): ListProductsQuery =>
  Object.assign(new ListProductsQuery(), overrides);

describe('ProductsService (final HT-02 catalog contract)', () => {
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
    // Khong con truy van phu tim bien the re nhat: gia doc tu cot price_from.
    const args = prisma.product.findMany.mock.calls[0]?.[0] as { include: object };
    expect(args.include).not.toHaveProperty('variants');
  });

  it('excludes inactive products and products without an active variant', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);

    await service.list(query({ search: 'AO' }));

    const args = prisma.product.findMany.mock.calls[0]?.[0] as { where: unknown };
    expect(args.where).toMatchObject({
      isActive: true,
      variants: { some: { isActive: true } },
      name: { contains: 'AO', mode: 'insensitive' },
    });
  });

  it('uses the first image ordered by sort order and returns null without images', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([row({ images: [] })]);

    const result = await service.list(query());

    expect(result.items[0]?.imageUrl).toBeNull();
    const args = prisma.product.findMany.mock.calls[0]?.[0] as { include: { images: unknown } };
    expect(args.include.images).toMatchObject({ orderBy: { sortOrder: 'asc' }, take: 1 });
  });

  it('returns NotFound for a non-sellable product detail', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findBySlug('khong-co')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'khong-co', isActive: true, variants: { some: { isActive: true } } },
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
});
