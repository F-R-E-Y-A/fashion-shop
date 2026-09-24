import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

/**
 * Kiem thu DON VI: PrismaService duoc GIA bang vi.fn, khong cham co so du lieu, chay trong vai ms.
 * Ten bai ghi ma dong viec va tieu chi chap nhan (PH-03/AC-n) de truy vet toi dac ta use case.
 * Chep tep nay khi viet service moi. Kiem thu qua HTTP that nam o apps/api/test/.
 */
const row = {
  id: 'p-1',
  name: 'Ao thun co tron basic',
  slug: 'ao-thun-co-tron-basic',
  description: null,
  price: 199000,
  imageUrl: null,
  category: { name: 'Ao', slug: 'ao' },
};

function makePrisma() {
  const prisma = {
    product: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    // $transaction that nhan mang cac loi goi; ban gia chi can tra ket qua tung cai theo thu tu.
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
  };
  return { prisma, service: new ProductsService(prisma as unknown as PrismaService) };
}

const query = (overrides: Partial<ListProductsQuery> = {}): ListProductsQuery =>
  Object.assign(new ListProductsQuery(), overrides);

describe('ProductsService (PH-03 Kham pha san pham)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: ProductsService;

  beforeEach(() => {
    ({ prisma, service } = makePrisma());
  });

  it('AC-1 phan trang: trang 2 co 12 dong thi bo qua 12 dong, totalPages lam tron len', async () => {
    prisma.product.count.mockResolvedValue(25);
    prisma.product.findMany.mockResolvedValue([row]);

    const result = await service.list(query({ page: 2, pageSize: 12 }));

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 12, take: 12 }),
    );
    expect(result).toMatchObject({ total: 25, page: 2, pageSize: 12, totalPages: 3 });
    expect(result.items[0]).toMatchObject({
      slug: 'ao-thun-co-tron-basic',
      price: '199000',
      categoryName: 'Ao',
    });
  });

  it('AC-2 tim theo ten: khong phan biet hoa thuong va chi lay san pham dang ban', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);

    await service.list(query({ search: 'AO' }));

    const args = prisma.product.findMany.mock.calls[0]?.[0] as { where: unknown };
    expect(args.where).toMatchObject({
      isActive: true,
      name: { contains: 'AO', mode: 'insensitive' },
    });
  });

  it('AC-1 danh sach rong: totalPages toi thieu la 1 de giao dien khong hien "trang 1 tren 0"', async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.product.findMany.mockResolvedValue([]);

    const result = await service.list(query());

    expect(result).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });

  it('AC-3 slug khong ton tai thi nem NotFoundException, khong tra null', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findBySlug('khong-co')).rejects.toBeInstanceOf(NotFoundException);
  });
});
