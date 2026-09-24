import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

const row = (overrides: Partial<{ variants: Array<{ price: { toString(): string } }>; images: Array<{ url: string }> }> = {}) => ({
  id: 'p-1',
  name: 'Ao thun co tron basic',
  slug: 'ao-thun-co-tron-basic',
  description: null,
  category: { name: 'Ao', slug: 'ao' },
  variants: [{ price: { toString: () => '199000' } }],
  images: [{ url: 'https://example.test/first.jpg' }],
  ...overrides,
});

function makePrisma() {
  const prisma = {
    product: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
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

  it('returns an active product with its lowest active variant price as an API string', async () => {
    prisma.product.count.mockResolvedValue(1);
    prisma.product.findMany.mockResolvedValue([row({ variants: [{ price: { toString: () => '149000' } }] })]);

    const result = await service.list(query());

    expect(result.items[0]).toMatchObject({ price: '149000', imageUrl: 'https://example.test/first.jpg' });
    const args = prisma.product.findMany.mock.calls[0]?.[0] as { include: { variants: unknown } };
    expect(args.include.variants).toMatchObject({ where: { isActive: true }, orderBy: { price: 'asc' }, take: 1 });
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
      expect.objectContaining({ where: { slug: 'khong-co', isActive: true, variants: { some: { isActive: true } } } }),
    );
  });
});
