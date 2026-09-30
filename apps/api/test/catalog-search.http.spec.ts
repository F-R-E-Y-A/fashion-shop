import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CATEGORIES } from '../prisma/seed/catalog.seed.js';
import { SearchDictionaryService } from '../src/modules/products/search/search-dictionary.service.js';
import { priceFromOf, PRODUCTS } from './fixtures/catalog-products.js';
import { createTestApp, type TestApp } from './helpers/create-test-app.js';
import { resetDatabase } from './helpers/db.js';

/**
 * Tim kiem, loc va goi y (UC-03.2, UC-03.3). Ky vong TINH TU PRODUCTS cua fixture, khong go so
 * tu du lieu crawl. Lop hieu cau co bo cau mau rieng o src/modules/products/search.
 */
const rootOf = (slug: string): string =>
  CATEGORIES.find((c) => c.slug === slug)?.parentSlug ?? slug;
const FAMILY_OF_COLOR: Record<string, string> = {
  den: 'den',
  trang: 'trang',
  be: 'be',
  'xanh-navy': 'navy',
  xam: 'xam',
};

interface Item {
  id: string;
  slug: string;
  price: string;
  categorySlug: string;
  colorSwatches: string[];
  colorCount: number;
  hoverImageUrl: string | null;
}

const slugs = (items: Item[]): string[] => items.map((i) => i.slug).sort();
const expected = (predicate: (p: (typeof PRODUCTS)[number]) => boolean): string[] =>
  PRODUCTS.filter(predicate)
    .map((p) => p.slug)
    .sort();

describe('GET /api/products: tim kiem va loc (UC-03.2, UC-03.3)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  const list = (query: Record<string, string | number | boolean>) =>
    t.http.get('/api/products').query({ pageSize: 60, ...query });

  describe('tim kiem', () => {
    it('UC-03.2/AC1 tim theo danh muc, co dau va khong dau cho cung ket qua', async () => {
      const withAccent = await list({ search: 'sơ mi' }).expect(200);
      const without = await list({ search: 'so mi' }).expect(200);
      const want = expected((p) => p.categorySlug === 'ao-so-mi');
      expect(slugs(withAccent.body.items)).toEqual(want);
      expect(slugs(without.body.items)).toEqual(want);
    });

    it('UC-03.2/AC1 tim theo kieu dang trong ten (polo)', async () => {
      const res = await list({ search: 'polo' }).expect(200);
      expect(slugs(res.body.items)).toEqual(expected((p) => p.name.toLowerCase().includes('polo')));
    });

    it('UC-03.2/AC1 khong phan biet hoa thuong', async () => {
      const upper = await list({ search: 'QUẦN' }).expect(200);
      expect(slugs(upper.body.items)).toEqual(expected((p) => rootOf(p.categorySlug) === 'quan'));
    });

    it('UC-03.2/AC2 search duoi 2 ky tu tra 400 theo khuon ApiErrorBody', async () => {
      const res = await list({ search: 'a' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, path: expect.any(String) });
    });

    it('UC-03.2/E3 search dai hon 120 ky tu tra 400', async () => {
      await list({ search: 'a'.repeat(121) }).expect(400);
      await list({ search: 'a'.repeat(120) }).expect(200);
    });

    it('UC-03.2 search rong hoac chi co dau cach nhu khong co search', async () => {
      const res = await list({ search: '   ' }).expect(200);
      expect(res.body.total).toBe(PRODUCTS.length);
      expect(res.body).not.toHaveProperty('interpretation');
    });

    it('UC-03.2/AC3 khong co ket qua tra items rong va khong noi truy van', async () => {
      const res = await list({ search: 'xyzqwv' }).expect(200);
      expect(res.body).toMatchObject({ items: [], total: 0, totalPages: 1, relaxed: [] });
    });

    it('UC-03.2/AC4 san pham ngung ban khong xuat hien', async () => {
      const target = PRODUCTS.find((p) => p.slug === 'mu-bucket-canvas');
      if (!target) throw new Error('Fixture thieu mu-bucket-canvas');
      expect(slugs((await list({ search: 'bucket' }).expect(200)).body.items)).toEqual([
        target.slug,
      ]);

      await t.prisma.product.update({ where: { slug: target.slug }, data: { isActive: false } });
      try {
        const res = await list({ search: 'bucket' }).expect(200);
        expect(res.body.items).toEqual([]);
      } finally {
        await t.prisma.product.update({ where: { slug: target.slug }, data: { isActive: true } });
      }
    });

    it('UC-03.2 interpretation tra chip co vi tri tu, gia va kieu dang', async () => {
      const res = await list({ search: 'polo nam dưới 400k' }).expect(200);
      expect(slugs(res.body.items)).toEqual(['ao-polo-cotton-pique']);
      const chips = res.body.interpretation.chips as Array<{ kind: string; tokens: number[] }>;
      expect(chips.map((c) => c.kind).sort()).toEqual(['audience', 'price', 'style']);
      expect(chips.every((c) => Array.isArray(c.tokens) && c.tokens.length > 0)).toBe(true);
      expect(res.body.interpretation).toMatchObject({ maxPrice: 400000, audience: 'nam' });
      expect(res.body.relaxed).toEqual([]);
    });

    it('UC-03.2 khong khop du cac y thi noi dan va noi ro da bo gi', async () => {
      const res = await list({ search: 'polo nữ trắng dưới 1k' }).expect(200);
      expect(res.body.relaxed.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('UC-03.2 "áo rẻ nhất" la y sap xep: gia tang dan', async () => {
      const res = await list({ search: 'áo rẻ nhất' }).expect(200);
      const prices = (res.body.items as Item[]).map((i) => Number(i.price));
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      expect(res.body.interpretation.sort).toBe('price_asc');
    });

    it('UC-03.2 cau tim kiem duoc ghi vao search_query_logs (chuan hoa, khong cho)', async () => {
      await t.prisma.searchQueryLog.deleteMany();
      await list({ search: '  Sơ Mi  ' }).expect(200);
      let rows = await t.prisma.searchQueryLog.findMany();
      for (let i = 0; i < 20 && rows.length === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        rows = await t.prisma.searchQueryLog.findMany();
      }
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        queryText: 'sơ mi',
        resultCount: expected((p) => p.categorySlug === 'ao-so-mi').length,
      });
    });

    it('UC-03.2 dip mac them trong search_configurations duoc hieu sau khi doc lai tu dien', async () => {
      const dictionary = t.app.get(SearchDictionaryService);
      const before = await list({ search: 'đồ đi đám cưới' }).expect(200);
      expect(before.body.interpretation.chips.map((c: { kind: string }) => c.kind)).not.toContain(
        'occasion',
      );

      await t.prisma.searchConfiguration.create({
        data: {
          configurationKey: 'synonyms.v1',
          configurationValue: {
            occasions: [
              {
                value: 'dam-cuoi',
                label: 'Dịp: đám cưới',
                triggers: ['đám cưới'],
                terms: ['lụa', 'linen'],
              },
            ],
          },
        },
      });
      try {
        dictionary.invalidate();
        const after = await list({ search: 'đồ đi đám cưới' }).expect(200);
        expect(after.body.interpretation.chips.map((c: { kind: string }) => c.kind)).toContain(
          'occasion',
        );
        expect(slugs(after.body.items)).toEqual(expected((p) => /lua|linen/.test(p.slug)));
      } finally {
        await t.prisma.searchConfiguration.deleteMany({
          where: { configurationKey: 'synonyms.v1' },
        });
        dictionary.invalidate();
      }
    });
  });

  describe('loc', () => {
    it('UC-03.3/AC1 minPrice va maxPrice: moi gia nam trong khoang', async () => {
      const res = await list({ minPrice: 250000, maxPrice: 460000 }).expect(200);
      const range = (p: (typeof PRODUCTS)[number]) =>
        priceFromOf(p) >= 250000 && priceFromOf(p) <= 460000;
      expect(slugs(res.body.items)).toEqual(expected(range));
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('UC-03.3/AC1 gia tuong minh thang gia hieu tu cau', async () => {
      const res = await list({ search: 'áo dưới 100k', minPrice: 400000, maxPrice: 700000 }).expect(
        200,
      );
      const items = res.body.items as Item[];
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => Number(i.price) >= 400000 && Number(i.price) <= 700000)).toBe(true);
    });

    it('UC-03.3/AC2 colors la HOAC giua cac ho mau', async () => {
      const res = await list({ colors: 'xam,navy' }).expect(200);
      expect(slugs(res.body.items)).toEqual(
        expected((p) =>
          p.colors.some((c) => FAMILY_OF_COLOR[c] === 'xam' || FAMILY_OF_COLOR[c] === 'navy'),
        ),
      );
    });

    it('UC-03.3/AC3 sizes loc theo bien the dang ban (chua xet ton kho, cho ham cua Duy)', async () => {
      const res = await list({ sizes: 'XL' }).expect(200);
      expect(slugs(res.body.items)).toEqual(expected((p) => p.sizes.includes('XL')));
      // Chu thuong cung duoc: sizes duoc doi thanh chu hoa.
      const lower = await list({ sizes: 'xl' }).expect(200);
      expect(slugs(lower.body.items)).toEqual(slugs(res.body.items));
    });

    it('UC-03.3/BR3 khac loai la VA: giao cua hai bo loc', async () => {
      const both = await list({ colors: 'den', sizes: 'M' }).expect(200);
      expect(slugs(both.body.items)).toEqual(
        expected((p) => p.colors.includes('den') && p.sizes.includes('M')),
      );
    });

    it('UC-03.3 audience loc doi tuong', async () => {
      const nu = await list({ audience: 'nu' }).expect(200);
      expect(slugs(nu.body.items)).toEqual(expected((p) => p.audience === 'nu'));
    });

    it('UC-03.3 loc nhieu danh muc: hop hai danh muc, cha keo theo con', async () => {
      const two = await list({ categories: 'ao-so-mi,quan-dai' }).expect(200);
      expect(slugs(two.body.items)).toEqual(
        expected((p) => p.categorySlug === 'ao-so-mi' || p.categorySlug === 'quan-dai'),
      );
      const parent = await list({ categories: 'ao' }).expect(200);
      expect(slugs(parent.body.items)).toEqual(expected((p) => rootOf(p.categorySlug) === 'ao'));
    });

    it('UC-03.3 categorySlug ket hop duoc voi bo loc moi', async () => {
      const res = await list({ categorySlug: 'quan', audience: 'nam' }).expect(200);
      expect(slugs(res.body.items)).toEqual(
        expected((p) => rootOf(p.categorySlug) === 'quan' && p.audience === 'nam'),
      );
    });

    it('UC-03.3/AC4 sort=price_asc va price_desc dung chieu khi co bo loc', async () => {
      const asc = await list({ audience: 'nam', sort: 'price_asc' }).expect(200);
      const prices = (asc.body.items as Item[]).map((i) => Number(i.price));
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
      const desc = await list({ audience: 'nam', sort: 'price_desc' }).expect(200);
      const down = (desc.body.items as Item[]).map((i) => Number(i.price));
      expect(down).toEqual([...down].sort((a, b) => b - a));
    });

    it('UC-03.1/AC4 phan trang khong trung san pham va total khop', async () => {
      const first = await list({ audience: 'nu', pageSize: 3, page: 1 }).expect(200);
      const second = await list({ audience: 'nu', pageSize: 3, page: 2 }).expect(200);
      const nu = expected((p) => p.audience === 'nu');
      expect(first.body).toMatchObject({ total: nu.length, totalPages: Math.ceil(nu.length / 3) });
      const seen = new Set([...first.body.items, ...second.body.items].map((i: Item) => i.slug));
      expect(seen.size).toBe(first.body.items.length + second.body.items.length);
    });

    it('UC-03.3 tham so sai tra 400', async () => {
      const bads: Array<Record<string, string | number>> = [
        { colors: 'tim-hoa' },
        { colors: 'den,khong-co' },
        { audience: 'abc' },
        { minPrice: 500, maxPrice: 100 },
        { minPrice: -1 },
        { minPrice: 1.5 },
        { sizes: 'QUA-DAI-KHONG-HOP-LE' },
        { categories: 'A_B' },
        { categories: Array.from({ length: 11 }, (_, i) => `c${i}`).join(',') },
        { facets: 'khong' },
        { sort: 'ngau-nhien' },
      ];
      for (const bad of bads) await list(bad).expect(400);
    });

    it('UC-03.3 tham so khong khai bao van bi tu choi (forbidNonWhitelisted)', async () => {
      await list({ ghost: 'x' }).expect(400);
    });
  });

  describe('facets', () => {
    it('UC-03.3 facets=true tra so dem khop du lieu, chi lua chon co san pham', async () => {
      const res = await list({ facets: true }).expect(200);
      const f = res.body.facets as {
        audience: Array<{ value: string; count: number }>;
        categories: Array<{ slug: string; parentSlug: string | null; count: number }>;
        colors: Array<{ family: string; hex: string; count: number }>;
        sizes: Array<{ code: string; count: number }>;
        price: Array<{ id: string; count: number }>;
      };

      expect(f.audience).toEqual([
        { value: 'nu', count: PRODUCTS.filter((p) => p.audience === 'nu').length },
        { value: 'nam', count: PRODUCTS.filter((p) => p.audience === 'nam').length },
      ]);

      const catCount = (slug: string): number | undefined =>
        f.categories.find((c) => c.slug === slug)?.count;
      expect(catCount('ao')).toBe(PRODUCTS.filter((p) => rootOf(p.categorySlug) === 'ao').length);
      expect(catCount('ao-so-mi')).toBe(
        PRODUCTS.filter((p) => p.categorySlug === 'ao-so-mi').length,
      );
      expect(f.categories.find((c) => c.slug === 'ao-so-mi')?.parentSlug).toBe('ao');

      for (const [code, family] of Object.entries(FAMILY_OF_COLOR)) {
        const want = PRODUCTS.filter((p) =>
          p.colors.some((c) => FAMILY_OF_COLOR[c] === family),
        ).length;
        expect(f.colors.find((c) => c.family === family)?.count, code).toBe(want);
      }
      // "Mac dinh" khong phai mau: khong tao ho "khac".
      expect(f.colors.map((c) => c.family)).not.toContain('khac');

      expect(f.sizes.find((s) => s.code === 'XL')?.count).toBe(
        PRODUCTS.filter((p) => p.sizes.includes('XL')).length,
      );
      // Co xep theo sort_order: S truoc M truoc L.
      const codes = f.sizes.map((s) => s.code);
      expect(codes.indexOf('S')).toBeLessThan(codes.indexOf('M'));
      expect(codes.indexOf('M')).toBeLessThan(codes.indexOf('L'));
      expect(f.price.every((b) => b.count > 0)).toBe(true);
      expect(f.price.reduce((sum, b) => sum + b.count, 0)).toBe(PRODUCTS.length);
    });

    it('UC-03.3 dem cua nhom khong bi chinh bo loc cua nhom do thu hep', async () => {
      const res = await list({ facets: true, colors: 'den' }).expect(200);
      const trang = res.body.facets.colors.find((c: { family: string }) => c.family === 'trang');
      expect(trang.count).toBe(
        PRODUCTS.filter((p) => p.colors.some((c) => FAMILY_OF_COLOR[c] === 'trang')).length,
      );
    });

    it('UC-03.3 khong facets thi khong co truong facets', async () => {
      const res = await list({ audience: 'nu' }).expect(200);
      expect(res.body).not.toHaveProperty('facets');
    });
  });

  describe('the san pham', () => {
    it('UC-03.1 co anh thu hai, chip mau va so mau', async () => {
      const res = await list({ audience: 'nam' }).expect(200);
      const polo = (res.body.items as Item[]).find((i) => i.slug === 'ao-polo-cotton-pique');
      expect(polo?.hoverImageUrl).toEqual(expect.stringContaining('picsum.photos'));
      expect(polo?.colorCount).toBe(2);
      expect(polo?.colorSwatches).toHaveLength(2);
      const belt = (await list({ categorySlug: 'that-lung' }).expect(200)).body.items[0] as Item;
      expect(belt.colorSwatches).toEqual([]);
      expect(belt.colorCount).toBe(0);
    });

    it('UC-03.1 duong liet ke co ban cung tra cac truong moi', async () => {
      const res = await t.http.get('/api/products').expect(200);
      expect(res.body.items[0]).toEqual(
        expect.objectContaining({
          hoverImageUrl: expect.anything(),
          colorSwatches: expect.any(Array),
          colorCount: expect.any(Number),
        }),
      );
      expect(res.body).not.toHaveProperty('interpretation');
    });
  });
});

describe('GET /api/search/suggest (UC-03.2)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('UC-03.2 tra toi da 5 san pham, danh muc, cau goi y va cach hieu cau', async () => {
    const res = await t.http.get('/api/search/suggest').query({ q: 'áo' }).expect(200);
    expect(res.body.products.length).toBeLessThanOrEqual(5);
    expect(res.body.categories.length).toBeLessThanOrEqual(3);
    expect(res.body.queries.length).toBeLessThanOrEqual(4);
    expect(res.body.total).toBe(PRODUCTS.filter((p) => rootOf(p.categorySlug) === 'ao').length);
    expect(res.body.interpretation.categorySlugs).toEqual(['ao']);
    expect(res.body.relaxed).toEqual([]);
    for (const q of res.body.queries as Array<{ text: string; count: number }>) {
      expect(q.count).toBeGreaterThan(0);
    }
  });

  it('UC-03.2 goi y khong ghi search_query_logs', async () => {
    await t.prisma.searchQueryLog.deleteMany();
    await t.http.get('/api/search/suggest').query({ q: 'quần' }).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await t.prisma.searchQueryLog.count()).toBe(0);
  });

  it('UC-03.2/E2 q ngan hon 2 ky tu hoac thieu q tra 400', async () => {
    await t.http.get('/api/search/suggest').query({ q: 'a' }).expect(400);
    await t.http.get('/api/search/suggest').expect(400);
  });

  it('UC-03.2/E3 q dai hon 120 ky tu tra 400', async () => {
    await t.http
      .get('/api/search/suggest')
      .query({ q: 'a'.repeat(121) })
      .expect(400);
  });

  it('UC-03.2 vuot 60 lan moi phut thi 429 kem Retry-After', async () => {
    await t.resetRateLimits();
    let last = await t.http.get('/api/search/suggest').query({ q: 'polo' });
    for (let i = 1; i < 60; i++)
      last = await t.http.get('/api/search/suggest').query({ q: 'polo' });
    expect(last.status).toBe(200);

    const blocked = await t.http.get('/api/search/suggest').query({ q: 'polo' }).expect(429);
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(blocked.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    await t.resetRateLimits();
  });
});

describe('GET /api/search/suggest khi kho gioi han loi (UC-03.2)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ failingRateLimiter: true });
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('UC-03.2 Redis loi thi cho qua, API chi doc khong nen chan tim kiem', async () => {
    await t.http.get('/api/search/suggest').query({ q: 'polo' }).expect(200);
  });
});

describe('GET /api/categories: productCount (UC-03.1)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t.close();
  });

  it('UC-03.1 danh muc cha bang tong cac con; danh muc rong co 0', async () => {
    const res = await t.http.get('/api/categories').expect(200);
    const roots = res.body as Array<{
      slug: string;
      productCount: number;
      children: Array<{ slug: string; productCount: number }>;
    }>;
    const count = (slug: string) => PRODUCTS.filter((p) => p.categorySlug === slug).length;
    for (const root of roots) {
      expect(root.productCount).toBe(
        PRODUCTS.filter((p) => rootOf(p.categorySlug) === root.slug).length,
      );
      expect(root.productCount).toBe(root.children.reduce((sum, c) => sum + c.productCount, 0));
      for (const child of root.children) expect(child.productCount).toBe(count(child.slug));
    }
  });

  it('UC-03.1 san pham ngung ban khong duoc dem', async () => {
    const before = (await t.http.get('/api/categories').expect(200)).body as Array<{
      slug: string;
      productCount: number;
    }>;
    await t.prisma.product.update({
      where: { slug: 'mu-luoi-trai-canvas' },
      data: { isActive: false },
    });
    try {
      const after = (await t.http.get('/api/categories').expect(200)).body as Array<{
        slug: string;
        productCount: number;
      }>;
      const pk = (rows: typeof before) =>
        rows.find((r) => r.slug === 'phu-kien')?.productCount ?? 0;
      expect(pk(after)).toBe(pk(before) - 1);
    } finally {
      await t.prisma.product.update({
        where: { slug: 'mu-luoi-trai-canvas' },
        data: { isActive: true },
      });
    }
  });
});
