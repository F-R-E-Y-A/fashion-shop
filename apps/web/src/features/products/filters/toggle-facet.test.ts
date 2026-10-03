import { describe, expect, it } from 'vitest';

import type { FacetPrice, SearchInterpretation } from '../api/index.js';
import { emptyCatalogParams } from '../lib/catalog-params.js';
import { isPriceSelected, toggleFacet } from './toggle-facet.js';

// "polo nữ trắng dưới 100k": tu 0 polo, 1 nữ, 2 trắng, 3-4 "dưới 100k"
const interpretation: SearchInterpretation = {
  categorySlugs: ['ao-polo'],
  audience: 'nu',
  colorFamilies: ['trang'],
  sizes: [],
  minPrice: null,
  maxPrice: 99999,
  sort: null,
  termGroups: [],
  ignored: [],
  chips: [
    { kind: 'category', value: 'ao-polo', label: 'Áo polo', source: 'polo', tokens: [0] },
    { kind: 'audience', value: 'nu', label: 'Nữ', source: 'nữ', tokens: [1] },
    { kind: 'color', value: 'trang', label: 'Màu trắng', source: 'trắng', tokens: [2] },
    {
      kind: 'price',
      value: '-99999',
      label: 'Dưới 100.000 ₫',
      source: 'dưới 100k',
      tokens: [3, 4],
    },
  ],
};
const base = { ...emptyCatalogParams, q: 'polo nữ trắng dưới 100k', page: 3 };
const bucket = (min: number | null, max: number | null): FacetPrice => ({
  id: 'b',
  label: 'b',
  min,
  max,
  count: 1,
});

describe('toggleFacet: luat dong bo cau va bo loc (UC-03.3)', () => {
  it('bam mau khong co trong cau thi them tham so va ve trang 1', () => {
    const next = toggleFacet(base, interpretation, 'color', 'den');
    expect(next).toMatchObject({ colors: ['den'], q: base.q, page: 1 });
  });

  it('bam mau dang den tu cau thi xoa dung chu do khoi cau, khong them tham so', () => {
    const next = toggleFacet(base, interpretation, 'color', 'trang');
    expect(next).toMatchObject({ q: 'polo nữ dưới 100k', colors: [] });
  });

  it('bam mau dang la tham so thi bo tham so', () => {
    const next = toggleFacet({ ...base, colors: ['den', 'xam'] }, interpretation, 'color', 'den');
    expect(next.colors).toEqual(['xam']);
  });

  it('danh muc va co theo cung luat', () => {
    expect(toggleFacet(base, interpretation, 'category', 'ao-polo').q).toBe('nữ trắng dưới 100k');
    expect(toggleFacet(base, interpretation, 'category', 'quan').categories).toEqual(['quan']);
    expect(toggleFacet(base, interpretation, 'size', 'M').sizes).toEqual(['M']);
  });

  it('doi tuong: bam Nam khi cau noi Nu thi dat tham so va xoa "nữ" khoi cau', () => {
    const next = toggleFacet(base, interpretation, 'audience', 'nam');
    expect(next).toMatchObject({ audience: 'nam', q: 'polo trắng dưới 100k' });
  });

  it('doi tuong: bam lai dung gia tri den tu cau thi chi xoa chu khoi cau', () => {
    const next = toggleFacet(base, interpretation, 'audience', 'nu');
    expect(next).toMatchObject({ audience: null, q: 'polo trắng dưới 100k' });
  });

  it('doi tuong: bam lai tham so dang bat thi bo tham so', () => {
    const next = toggleFacet({ ...base, audience: 'nam' }, interpretation, 'audience', 'nam');
    expect(next.audience).toBeNull();
    expect(next.q).toBe(base.q);
  });

  it('gia: chon moc thi dat min/max va xoa y gia khoi cau', () => {
    const next = toggleFacet(base, interpretation, 'price', bucket(100000, 299999));
    expect(next).toMatchObject({
      minPrice: 100000,
      maxPrice: 299999,
      q: 'polo nữ trắng',
      page: 1,
    });
  });

  it('gia: bam lai moc dang chon thi bo ca hai tham so', () => {
    const chosen = { ...base, minPrice: 100000, maxPrice: 299999 };
    expect(isPriceSelected(chosen, bucket(100000, 299999))).toBe(true);
    const next = toggleFacet(chosen, interpretation, 'price', bucket(100000, 299999));
    expect(next).toMatchObject({ minPrice: null, maxPrice: null });
  });

  it('khong co interpretation (trang danh muc) thi luon them hoac bo tham so', () => {
    const next = toggleFacet(emptyCatalogParams, undefined, 'color', 'trang');
    expect(next.colors).toEqual(['trang']);
    expect(toggleFacet(next, undefined, 'color', 'trang').colors).toEqual([]);
  });
});
