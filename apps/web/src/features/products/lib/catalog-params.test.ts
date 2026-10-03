import { describe, expect, it } from 'vitest';

import {
  countActiveFilters,
  emptyCatalogParams,
  patchCatalogParams,
  readCatalogParams,
  writeCatalogParams,
} from './catalog-params.js';

const read = (query: string) => readCatalogParams(new URLSearchParams(query));

describe('catalog-params (UC-03.2, UC-03.3)', () => {
  it('khu hoi: doc roi ghi ra dung duong dan ban dau', () => {
    const query =
      'q=polo+n%E1%BB%AF&audience=nu&categories=ao,quan-dai&colors=den,trang&sizes=M,XL&minPrice=100000&maxPrice=300000&sort=price_asc&page=3';
    const params = read(query);
    expect(params).toEqual({
      q: 'polo nữ',
      audience: 'nu',
      categories: ['ao', 'quan-dai'],
      colors: ['den', 'trang'],
      sizes: ['M', 'XL'],
      minPrice: 100000,
      maxPrice: 300000,
      sort: 'price_asc',
      page: 3,
    });
    expect(read(writeCatalogParams(params).toString())).toEqual(params);
  });

  it('duong dan rong cho gia tri mac dinh va ghi lai thanh chuoi rong', () => {
    expect(read('')).toEqual(emptyCatalogParams);
    expect(writeCatalogParams(emptyCatalogParams).toString()).toBe('');
  });

  it('gia tri sai bi bo qua chu khong lam hong trang', () => {
    const params = read(
      'audience=abc&sort=ngau-nhien&page=-2&minPrice=1.5&maxPrice=abc&categories=A_B,ok-1&colors=Den!,den&sizes=qua-dai,m',
    );
    expect(params).toMatchObject({
      audience: null,
      sort: null,
      page: 1,
      minPrice: null,
      maxPrice: null,
      categories: ['ok-1'],
      colors: ['den'],
      sizes: ['M'],
    });
  });

  it('chuan hoa: cat khoang trang va gioi han 120 ky tu, bo trung, toi da 10 gia tri', () => {
    const many = Array.from({ length: 14 }, (_, i) => `c${i}`).join(',');
    const long = encodeURIComponent(`  ${'a'.repeat(200)}  `);
    const params = read(`q=${long}&categories=${many}&sizes=m,M,m`);
    expect(params.q).toHaveLength(120);
    expect(params.categories).toHaveLength(10);
    expect(params.sizes).toEqual(['M']);
  });

  it('doi bo loc thi bo page; chi doi trang thi giu bo loc', () => {
    const current = { ...emptyCatalogParams, colors: ['den'], page: 4 };
    expect(patchCatalogParams(current, { sizes: ['M'] }).page).toBe(1);
    expect(patchCatalogParams(current, { page: 5 })).toMatchObject({ colors: ['den'], page: 5 });
  });

  it('dem bo loc tuong minh: khoang gia tinh la mot', () => {
    expect(countActiveFilters(emptyCatalogParams)).toBe(0);
    expect(
      countActiveFilters({
        ...emptyCatalogParams,
        audience: 'nu',
        colors: ['den', 'trang'],
        minPrice: 1,
        maxPrice: 9,
      }),
    ).toBe(4);
  });
});
