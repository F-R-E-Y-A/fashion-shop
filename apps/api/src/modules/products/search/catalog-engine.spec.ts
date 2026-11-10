import { describe, expect, it } from 'vitest';

import { type CatalogRow, HYBRID, matchTerm, prepareProducts, search } from './catalog-engine.js';

type Row = Partial<CatalogRow> & Pick<CatalogRow, 'id' | 'name'>;

const row = (o: Row): CatalogRow => ({
  price: 49000,
  cat: 'ao-thun',
  catName: 'Áo thun',
  root: 'ao',
  rootName: 'Áo',
  audience: 'nu',
  colors: ['Trắng'],
  sizes: ['M'],
  featured: false,
  description: null,
  ...o,
});

// Thu tu mang la thu tu nap (moi nhat truoc), giong CatalogSearchService.
const CATALOG = prepareProducts([
  row({
    id: 'p1',
    name: 'Áo Polo Nữ Coolmax Thoáng Mát',
    colors: ['Trắng', 'Đen'],
    sizes: ['S', 'M'],
    featured: true,
  }),
  row({ id: 'p2', name: 'Áo Polo Nữ Pique Mắt Chim', colors: ['Hồng'], price: 99000 }),
  row({
    id: 'p3',
    name: 'Áo Polo Nam Airycool Phối Nẹp',
    audience: 'nam',
    colors: ['Xanh navy', 'Tím than'],
    price: 299000,
    sizes: ['L', 'XL'],
  }),
  row({
    id: 'p4',
    name: 'Áo Sơ Mi Nữ Lụa Tay Dài',
    cat: 'ao-so-mi',
    catName: 'Áo sơ mi',
    colors: ['Kem'],
    price: 149000,
  }),
  row({
    id: 'p5',
    name: 'Áo Sơ Mi Nam Tay Ngắn',
    cat: 'ao-so-mi',
    catName: 'Áo sơ mi',
    audience: 'nam',
    colors: ['Trắng'],
    price: 79000,
  }),
  row({
    id: 'p6',
    name: 'Quần Tây Nữ Ống Rộng',
    cat: 'quan-dai',
    catName: 'Quần dài',
    root: 'quan',
    rootName: 'Quần',
    colors: ['Đen'],
    price: 199000,
    sizes: ['M'],
  }),
  row({
    id: 'p7',
    name: 'Quần Jeans Nam Ống Đứng',
    cat: 'quan-dai',
    catName: 'Quần dài',
    root: 'quan',
    rootName: 'Quần',
    audience: 'nam',
    colors: ['Xanh coban'],
    price: 249000,
    sizes: ['30', '31'],
  }),
  row({
    id: 'p8',
    name: 'Thắt Lưng Da Bò',
    cat: 'that-lung',
    catName: 'Thắt lưng',
    root: 'phu-kien',
    rootName: 'Phụ kiện',
    audience: 'nam',
    colors: ['Đen'],
    price: 59000,
    sizes: ['FREE'],
  }),
  row({
    id: 'p9',
    name: 'Áo Khoác Gió Nam Thể Thao',
    cat: 'ao-khoac',
    catName: 'Áo khoác',
    audience: 'nam',
    colors: ['Đen'],
    price: 99000,
  }),
  row({
    id: 'p10',
    name: 'Áo Thun Nữ Cổ Tròn Cotton',
    colors: ['Trắng'],
    price: 39000,
    description: 'Chất liệu cotton thấm hút tốt',
  }),
]);

const ids = (r: { items: Array<{ id: string }> }): string[] => r.items.map((p) => p.id);

describe('search: hieu cau va loc', () => {
  it('UC-03.2 polo nu trang duoi 100k -> chi polo nu mau trang co gia toi 100k', () => {
    const r = search(CATALOG, { q: 'polo nữ trắng dưới 100k' });
    expect(ids(r)).toEqual(['p1']);
    expect(r.relaxed).toEqual([]);
    expect(r.sort).toBe('relevance');
  });

  it('UC-03.2 khong dau va co dau cho cung ket qua', () => {
    expect(ids(search(CATALOG, { q: 'ao so mi' }))).toEqual(
      ids(search(CATALOG, { q: 'áo sơ mi' })),
    );
  });

  it('UC-03.2 bay bo dau: "áo mát" khong lay san pham chi co "mắt chim"', () => {
    const r = search(CATALOG, { q: 'áo mát' });
    expect(ids(r)).toContain('p1');
    expect(ids(r)).not.toContain('p2');
  });

  it('UC-03.2 go sai mot hai chu van tim ra (poloo -> polo)', () => {
    const r = search(CATALOG, { q: 'poloo' });
    expect(ids(r).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('UC-03.2/AC3 cau khong khop gi tra rong, khong noi', () => {
    const r = search(CATALOG, { q: 'xyzqwv' });
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.relaxed).toEqual([]);
  });

  it('UC-03.2 khong khop du cac y thi noi dan, noi ro da bo gi', () => {
    const r = search(CATALOG, { q: 'polo nữ trắng dưới 1k' });
    expect(r.relaxed).toEqual(['bỏ dịp mặc và kiểu dáng', 'bỏ màu', 'bỏ khoảng giá']);
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((p) => p.audience === 'nu')).toBe(true);
  });

  it('UC-03.3/BR3 nhieu gia tri cung loai la HOAC, khac loai la VA', () => {
    const either = search(CATALOG, { filters: { colors: ['den', 'hong'] } });
    expect(ids(either).sort()).toEqual(['p1', 'p2', 'p6', 'p8', 'p9']);
    const both = search(CATALOG, { filters: { colors: ['den', 'hong'], sizes: ['M'] } });
    expect(ids(both).sort()).toEqual(['p1', 'p2', 'p6', 'p9']);
  });

  it('UC-03.3 danh muc cha keo theo danh muc con', () => {
    const r = search(CATALOG, { filters: { categories: ['ao'] } });
    expect(ids(r).sort()).toEqual(['p1', 'p10', 'p2', 'p3', 'p4', 'p5', 'p9']);
    const child = search(CATALOG, { filters: { categories: ['ao-so-mi', 'quan-dai'] } });
    expect(ids(child).sort()).toEqual(['p4', 'p5', 'p6', 'p7']);
  });

  it('UC-03.3/AC1 gia tuong minh thang gia hieu tu cau', () => {
    const r = search(CATALOG, {
      q: 'polo dưới 50k',
      filters: { minPrice: 90000, maxPrice: 300000 },
    });
    expect(r.asked.minPrice).toBe(90000);
    expect(r.asked.maxPrice).toBe(300000);
    expect(ids(r).sort()).toEqual(['p2', 'p3']);
  });

  it('UC-03.3 loc doi tuong tuong minh thang doi tuong hieu tu cau', () => {
    const r = search(CATALOG, { q: 'polo nữ', filters: { audience: 'nam' } });
    expect(r.asked.audience).toBe('nam');
    expect(ids(r)).toEqual(['p3']);
  });

  it('UC-03.3 featured chi lay san pham noi bat', () => {
    expect(ids(search(CATALOG, { filters: { featured: true } }))).toEqual(['p1']);
  });

  it('UC-03.3/AC4 sap xep theo gia dung chieu, hoa theo thu tu nap', () => {
    const asc = search(CATALOG, { sort: 'price_asc' });
    expect(asc.items.map((p) => p.price)).toEqual(
      [...asc.items.map((p) => p.price)].sort((a, b) => a - b),
    );
    expect(ids(asc).slice(0, 2)).toEqual(['p10', 'p1']);
    const desc = search(CATALOG, { sort: 'price_desc' });
    expect(ids(desc)[0]).toBe('p3');
  });

  it('UC-03.2 "rẻ nhất" trong cau la y sap xep, khong phai tu khoa', () => {
    const r = search(CATALOG, { q: 'áo rẻ nhất' });
    expect(r.sort).toBe('price_asc');
    expect(r.intent.groups).toEqual([]);
  });

  it('khong co cau hoi va khong co bo loc thi tra ca danh sach theo thu tu nap', () => {
    const r = search(CATALOG);
    expect(ids(r)).toEqual(CATALOG.map((p) => p.id));
    expect(r.sort).toBe('newest');
  });
});

describe('search: facet', () => {
  it('UC-03.3 tong facet doi tuong bang tong so ket qua khi khong loc doi tuong', () => {
    const r = search(CATALOG, { q: 'áo' });
    const sum = [...r.facets.audience.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.total);
  });

  it('UC-03.3 dem facet mau bo qua chinh bo loc mau, con lai van ap dung', () => {
    const r = search(CATALOG, { filters: { audience: 'nu', colors: ['den'] } });
    // Chon them "hong" se ra san pham hong cua nu: facet mau van dem hong = 1 du dang loc den.
    expect(r.facets.color.get('hong')).toBe(1);
    expect(r.facets.color.get('navy')).toBeUndefined();
  });

  it('UC-03.3 dem danh muc gom ca con lan cha', () => {
    const r = search(CATALOG);
    expect(r.facets.category.get('ao')).toBe(7);
    expect(r.facets.category.get('ao-thun')).toBe(4);
    expect(r.facets.category.get('quan')).toBe(2);
  });

  it('UC-03.3 dem moc gia theo PRICE_BUCKETS', () => {
    const r = search(CATALOG);
    expect(r.facets.price.get('duoi-50k')).toBe(2);
    expect(r.facets.price.get('tu-500k')).toBeUndefined();
  });

  it('UC-03.3 nhieu ten mau nguon ve mot ho mau chi dem mot lan tren san pham', () => {
    const r = search(CATALOG, { filters: { audience: 'nam' } });
    expect(r.facets.color.get('navy')).toBe(1);
  });
});

describe('matchTerm', () => {
  it('UC-03.2 diem: 3 trong ten, 1 trong van ban, 0,6 go sai, 0 neu khong khop', () => {
    const [p] = prepareProducts([
      row({ id: 'x', name: 'Áo Polo Nữ', description: 'chất liệu cotton' }),
    ]);
    expect(matchTerm(p, 'polo')).toBe(3);
    expect(matchTerm(p, 'cotton')).toBe(1);
    expect(matchTerm(p, 'poloo')).toBe(0.6);
    expect(matchTerm(p, 'jeans')).toBe(0);
  });
});

describe('search: gop hang luat va ngu nghia (ADR-048)', () => {
  /** Cosine gia lap: san pham co trong bang lay diem do, con lai 0,5. */
  const simOf = (top: Record<string, number>): Map<string, number> =>
    new Map(CATALOG.map((p) => [p.id, top[p.id] ?? 0.5]));

  it('UC-03.2/AC5 cau theo y dinh: san pham gan nghia nhat len dau, semantic.applied', () => {
    const rules = search(CATALOG, { q: 'áo mặc mùa lạnh' });
    const hybrid = search(CATALOG, { q: 'áo mặc mùa lạnh' }, undefined, simOf({ p9: 0.9 }));
    expect(rules.total).toBeGreaterThan(1);
    expect(ids(rules)[0]).not.toBe('p9');
    expect(ids(hybrid)[0]).toBe('p9');
    expect(hybrid.semantic.applied).toBe(true);
    expect(rules.semantic).toEqual({ applied: false, added: 0 });
  });

  it('UC-03.2/AC6 them san pham khong khop tu nhung gan nghia; khong vuot san pham khop tu gan nghia hon', () => {
    // "cotton" chi khop p10; p4 (so mi nu, cung goc ao) gan nghia nen duoc them sau p10.
    const rules = search(CATALOG, { q: 'áo cotton nữ' });
    const hybrid = search(CATALOG, { q: 'áo cotton nữ' }, undefined, simOf({ p10: 0.9, p4: 0.89 }));
    expect(ids(rules)).toEqual(['p10']);
    expect(ids(hybrid)).toEqual(['p10', 'p4']);
    expect(hybrid.semantic).toEqual({ applied: true, added: 1 });
  });

  it('UC-03.2/AC6 ung vien gan nghia hon han vuot san pham chi khop tu yeu', () => {
    const small = prepareProducts([
      row({ id: 'weak', name: 'Áo Thun Basic', description: 'vải cotton' }),
      row({ id: 'near', name: 'Áo Polo Airycool Thấm Hút' }),
    ]);
    const sim = new Map([
      ['weak', 0.5],
      ['near', 0.9],
    ]);
    const rules = search(small, { q: 'áo cotton' });
    expect(ids(rules)).toEqual(['weak']);
    expect(ids(search(small, { q: 'áo cotton' }, undefined, sim))).toEqual(['near', 'weak']);
  });

  it('UC-03.2/AC6 ung vien them phai qua bo loc cau truc; facet dem ca ung vien them', () => {
    // p9 (nam) gan nghia nhat nhung cau co "nữ" nen bi loai; p4 duoc them va duoc dem trong facet.
    const hybrid = search(
      CATALOG,
      { q: 'áo cotton nữ' },
      undefined,
      simOf({ p9: 0.95, p10: 0.93, p4: 0.93 }),
    );
    expect(ids(hybrid)).not.toContain('p9');
    expect(ids(hybrid)).toContain('p4');
    expect(hybrid.facets.category.get('ao-so-mi')).toBe(1);
    expect(hybrid.facets.audience.get('nu')).toBe(hybrid.total);
  });

  it('UC-03.2/AC8 luat tra rong thi van rong du co diem ngu nghia', () => {
    const sim = simOf({ p6: 0.99, p4: 0.98 });
    const r = search(CATALOG, { q: 'váy dự tiệc' }, undefined, sim);
    expect(search(CATALOG, { q: 'váy dự tiệc' }).total).toBe(0);
    expect(r.total).toBe(0);
    expect(r.semantic.applied).toBe(false);
  });

  it('UC-03.2/AC9 sap theo gia hoac cau chi co rang buoc thi khong gop hang', () => {
    const sim = simOf({ p9: 0.99 });
    const byPrice = search(CATALOG, { q: 'áo', sort: 'price_asc' }, undefined, sim);
    expect(byPrice.semantic.applied).toBe(false);
    const prices = byPrice.items.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const onlyPrice = search(CATALOG, { q: 'dưới 100k' }, undefined, sim);
    expect(onlyPrice.sort).toBe('newest');
    expect(onlyPrice.semantic.applied).toBe(false);
  });

  it('UC-03.2/AC9 moi lan them toi da HYBRID.extraMax san pham chi do ngu nghia', () => {
    const many = prepareProducts([
      row({ id: 'hit', name: 'Áo Polo Đặc Biệt' }),
      ...Array.from({ length: 20 }, (_, k) => row({ id: `x${k}`, name: `Áo Thun Mẫu ${k}` })),
    ]);
    const sim = new Map(many.map((p) => [p.id, 0.9]));
    const r = search(many, { q: 'polo đặc biệt' }, undefined, sim);
    expect(r.semantic.added).toBe(HYBRID.extraMax);
    expect(r.total).toBe(1 + HYBRID.extraMax);
    expect(ids(r)[0]).toBe('hit');
  });
});
