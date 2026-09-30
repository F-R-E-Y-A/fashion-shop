import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from '../dto/list-products.query.js';
import { CatalogSearchService } from './catalog-search.service.js';
import { DEFAULT_DICTIONARY } from './dictionary.js';
import type { SearchDictionaryService } from './search-dictionary.service.js';

const D = (value: string) => new Prisma.Decimal(value);

const AO = { slug: 'ao', name: 'Áo', sortOrder: 1 };
const QUAN = { slug: 'quan', name: 'Quần', sortOrder: 2 };
const PHU_KIEN = { slug: 'phu-kien', name: 'Phụ kiện', sortOrder: 3 };

const variant = (colorName: string, sizeCode: string, sizeOrder: number, colorCode?: string) => ({
  listPrice: D('49000'),
  salePrice: null,
  color: { code: colorCode ?? colorName.toLowerCase(), name: colorName },
  size: { code: sizeCode, sortOrder: sizeOrder },
});

const product = (
  o: Partial<{
    id: string;
    name: string;
    audience: string | null;
    priceFrom: string;
    isFeatured: boolean;
    category: { slug: string; name: string; sortOrder: number; parent: typeof AO | null };
    variants: ReturnType<typeof variant>[];
    description: string | null;
  }> &
    Pick<{ id: string; name: string }, 'id' | 'name'>,
) => ({
  slug: o.id,
  description: null,
  priceFrom: D(o.priceFrom ?? '49000'),
  isFeatured: false,
  audience: 'nu',
  category: { slug: 'ao-thun', name: 'Áo thun', sortOrder: 1, parent: AO },
  brand: null,
  variants: [variant('Trắng', 'M', 30)],
  images: [
    { url: `https://example.test/${o.id}-1.jpg` },
    { url: `https://example.test/${o.id}-2.jpg` },
  ],
  ...o,
  priceFromDecimal: undefined,
});

const CATALOG = [
  product({
    id: 'p1',
    name: 'Áo Polo Nữ Coolmax Thoáng Mát',
    isFeatured: true,
    variants: [variant('Trắng', 'M', 30), variant('Đen', 'S', 20)],
  }),
  product({
    id: 'p2',
    name: 'Áo Polo Nam Airycool Phối Nẹp',
    audience: 'nam',
    priceFrom: '299000',
    variants: [variant('Xanh navy', 'L', 40)],
  }),
  product({
    id: 'p3',
    name: 'Áo Sơ Mi Nữ Lụa Tay Dài',
    priceFrom: '149000',
    category: { slug: 'ao-so-mi', name: 'Áo sơ mi', sortOrder: 2, parent: AO },
    variants: [variant('Kem', 'M', 30)],
  }),
  product({
    id: 'p4',
    name: 'Quần Tây Nữ Ống Rộng',
    priceFrom: '199000',
    category: { slug: 'quan-dai', name: 'Quần dài', sortOrder: 1, parent: QUAN },
    variants: [variant('Đen', 'M', 30)],
  }),
  product({
    id: 'p5',
    name: 'Thắt Lưng Da Bò',
    audience: 'nam',
    category: { slug: 'that-lung', name: 'Thắt lưng', sortOrder: 2, parent: PHU_KIEN },
    variants: [variant('Mặc định', 'FREE', 900, 'mac-dinh')],
  }),
];

const query = (overrides: Partial<ListProductsQuery> = {}): ListProductsQuery =>
  Object.assign(new ListProductsQuery(), overrides);

function make() {
  const findMany = vi.fn().mockResolvedValue(CATALOG);
  const create = vi.fn().mockResolvedValue({});
  const prisma = { product: { findMany }, searchQueryLog: { create } };
  const dictionary = { get: vi.fn().mockResolvedValue(DEFAULT_DICTIONARY) };
  const service = new CatalogSearchService(
    prisma as unknown as PrismaService,
    dictionary as unknown as SearchDictionaryService,
  );
  return { service, findMany, create };
}

describe('CatalogSearchService.list', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('UC-03.3 khong co search thi khong tra interpretation, relaxed, facets va khong ghi nhat ky', async () => {
    const { service, create } = make();
    const res = await service.list(query({ audience: 'nu' }));
    expect(res.total).toBe(3);
    expect(res).not.toHaveProperty('interpretation');
    expect(res).not.toHaveProperty('relaxed');
    expect(res).not.toHaveProperty('facets');
    expect(create).not.toHaveBeenCalled();
  });

  it('UC-03.2 co search thi tra interpretation va relaxed, ghi nhat ky khong cho', async () => {
    const { service, create } = make();
    const res = await service.list(query({ search: 'polo nữ' }));
    expect(res.items.map((i) => i.id)).toEqual(['p1']);
    expect(res.interpretation?.chips.map((c) => c.kind)).toEqual(['style', 'audience']);
    expect(res.relaxed).toEqual([]);
    expect(create).toHaveBeenCalledWith({ data: { queryText: 'polo nữ', resultCount: 1 } });
  });

  it('UC-03.2 nhat ky luu cau da chuan hoa, cat 120 ky tu, loi ghi khong lam hong cau tra loi', async () => {
    const { service, create } = make();
    create.mockRejectedValue(new Error('DB chet'));
    const long = `  POLO ${'x'.repeat(200)}  `;
    const res = await service.list(query({ search: long.trim() }));
    expect(res).toBeDefined();
    const data = (create.mock.calls[0]?.[0] as { data: { queryText: string } }).data;
    expect(data.queryText).toHaveLength(120);
    expect(data.queryText.startsWith('polo x')).toBe(true);
    await Promise.resolve();
  });

  it('UC-03.1/AC4 phan trang cat tren danh sach da loc, total la tong truoc khi cat', async () => {
    const { service } = make();
    const first = await service.list(query({ audience: 'nu', page: 1, pageSize: 2 }));
    const second = await service.list(query({ audience: 'nu', page: 2, pageSize: 2 }));
    expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2, totalPages: 2 });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(3);
  });

  it('UC-03.1 categorySlug cha keo theo danh muc con', async () => {
    const { service } = make();
    const res = await service.list(query({ categorySlug: 'ao', pageSize: 60 }));
    expect(res.items.map((i) => i.id).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('UC-03.1 the san pham co anh thu hai, chip mau, so mau; mau mac dinh khong tinh', async () => {
    const { service } = make();
    const res = await service.list(query({ audience: 'nam', pageSize: 60 }));
    const polo = res.items.find((i) => i.id === 'p2');
    expect(polo).toMatchObject({
      hoverImageUrl: 'https://example.test/p2-2.jpg',
      colorSwatches: ['#23304d'],
      colorCount: 1,
    });
    const belt = res.items.find((i) => i.id === 'p5');
    expect(belt).toMatchObject({ colorSwatches: [], colorCount: 0 });
  });

  it('UC-03.3 facets=true tra mang co dem, chi lua chon con san pham, co xep theo thu tu', async () => {
    const { service } = make();
    const res = await service.list(query({ facets: true, pageSize: 60 }));
    const f = res.facets;
    expect(f?.audience).toEqual([
      { value: 'nu', count: 3 },
      { value: 'nam', count: 2 },
    ]);
    // Cha roi den con, cac goc theo sort_order; danh muc rong khong xuat hien.
    expect(f?.categories.map((c) => c.slug)).toEqual([
      'ao',
      'ao-thun',
      'ao-so-mi',
      'quan',
      'quan-dai',
      'phu-kien',
      'that-lung',
    ]);
    expect(f?.categories.find((c) => c.slug === 'ao')).toMatchObject({
      parentSlug: null,
      count: 3,
    });
    expect(f?.categories.find((c) => c.slug === 'ao-thun')).toMatchObject({
      parentSlug: 'ao',
      count: 2,
    });
    // Ho mau co san pham; "khac" khong xuat hien vi mau mac dinh khong tinh.
    expect(f?.colors.map((c) => c.family)).toEqual(['den', 'trang', 'navy', 'be']);
    expect(f?.colors[0]).toMatchObject({ label: 'Đen', hex: '#1d1814', count: 2 });
    // Co xep theo sort_order cua co: S 20, M 30, L 40, FREE 900.
    expect(f?.sizes.map((s) => s.code)).toEqual(['S', 'M', 'L', 'FREE']);
    expect(f?.price.every((p) => p.count > 0)).toBe(true);
  });

  it('UC-03.3 lua chon dang chon van hien du count = 0', async () => {
    const { service } = make();
    const res = await service.list(query({ facets: true, colors: ['hong'], pageSize: 60 }));
    expect(res.total).toBe(0);
    expect(res.facets?.colors.find((c) => c.family === 'hong')).toMatchObject({ count: 0 });
  });
});

describe('CatalogSearchService.suggest', () => {
  it('UC-03.2 tra toi da 5 san pham, danh muc dem tren ket qua va cau goi y co ket qua', async () => {
    const { service, create } = make();
    const res = await service.suggest('polo');
    expect(res.total).toBe(2);
    expect(res.products.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(res.categories).toEqual([{ slug: 'ao-thun', name: 'Áo thun', count: 2 }]);
    expect(res.interpretation.chips[0]).toMatchObject({ kind: 'style', source: 'polo' });
    expect(res.relaxed).toEqual([]);
    expect(res.queries.length).toBeLessThanOrEqual(4);
    expect(res.queries.map((q) => q.text)).toContain('áo polo');
    // Goi y chua phai tim kiem that: khong ghi nhat ky.
    expect(create).not.toHaveBeenCalled();
  });

  it('UC-03.2 cau goi y khong lap lai chinh cau da go va chi giu cau co ket qua', async () => {
    const { service } = make();
    const res = await service.suggest('áo sơ mi');
    expect(res.queries.map((q) => q.text)).not.toContain('áo sơ mi');
    expect(res.queries.every((q) => q.count > 0)).toBe(true);
  });
});
