import { describe, expect, it } from 'vitest';

import { Prisma } from '../../generated/prisma/client.js';
import { preferredFamilyOf, toProductResponse } from './storefront.js';

const D = (value: string) => new Prisma.Decimal(value);

const row = (overrides: Partial<Parameters<typeof toProductResponse>[0]> = {}) => ({
  id: 'p-1',
  name: 'Áo thun',
  slug: 'ao-thun',
  description: null,
  category: { name: 'Áo thun', slug: 'ao-thun' },
  brand: null,
  priceFrom: D('49000'),
  variants: [],
  images: [{ url: 'https://example.test/1.jpg' }],
  ...overrides,
});

const variant = (name: string, code = name.toLowerCase()) => ({
  listPrice: D('49000'),
  salePrice: null,
  color: { code, name },
});

describe('toProductResponse: truong moi cua the san pham (UC-03.1)', () => {
  it('anh thu hai la anh doi khi re chuot; chi co mot anh thi null', () => {
    const two = toProductResponse(
      row({
        images: [{ url: 'https://example.test/1.jpg' }, { url: 'https://example.test/2.jpg' }],
      }),
    );
    expect(two).toMatchObject({
      imageUrl: 'https://example.test/1.jpg',
      hoverImageUrl: 'https://example.test/2.jpg',
    });
    expect(toProductResponse(row()).hoverImageUrl).toBeNull();
  });

  it('chip mau la hex cua ho mau, khong lap, toi da 4, giu thu tu bien the', () => {
    const r = toProductResponse(
      row({
        variants: [
          variant('Đen'),
          variant('Đen chì'), // cung ho voi Đen: khong them chip thu hai
          variant('Trắng'),
          variant('Hồng'),
          variant('Navy'),
          variant('Vàng'),
        ],
      }),
    );
    expect(r.colorSwatches).toEqual(['#1d1814', '#f6f3ee', '#d98f9c', '#23304d']);
  });

  it('so mau dem theo ten mau khac nhau, khong theo ho mau', () => {
    const r = toProductResponse(
      row({ variants: [variant('Đen'), variant('Đen chì'), variant('Đen')] }),
    );
    expect(r.colorCount).toBe(2);
  });

  it('mau mac dinh khong tinh la mau', () => {
    const r = toProductResponse(row({ variants: [variant('Mặc định', 'mac-dinh')] }));
    expect(r.colorSwatches).toEqual([]);
    expect(r.colorCount).toBe(0);
  });

  it('bien the khong kem thong tin mau van khong loi', () => {
    const r = toProductResponse(row({ variants: [{ listPrice: D('49000'), salePrice: null }] }));
    expect(r.colorSwatches).toEqual([]);
    expect(r.colorCount).toBe(0);
  });
});

describe('toProductResponse: anh the theo ho mau dang loc (UC-03.3)', () => {
  const image = (url: string, colorName: string | null) => ({
    url,
    ...(colorName ? { color: { name: colorName } } : {}),
  });
  const multiColorRow = row({
    images: [
      image('https://example.test/vang.jpg', 'Vàng'), // anh mac dinh cua san pham
      image('https://example.test/xanh-1.jpg', 'Xanh dương'),
      image('https://example.test/xanh-2.jpg', 'Xanh biển'), // cung ho xanh-duong
      image('https://example.test/trang.jpg', 'Trắng'),
    ],
  });

  it('loc mot ho mau: anh chinh va anh re chuot la anh cua mau do', () => {
    const r = toProductResponse(multiColorRow, { preferFamily: 'xanh-duong' });
    expect(r.imageUrl).toBe('https://example.test/xanh-1.jpg');
    expect(r.hoverImageUrl).toBe('https://example.test/xanh-2.jpg');
  });

  it('khong truyen ho mau uu tien: giu hai anh dau nhu cu', () => {
    const r = toProductResponse(multiColorRow);
    expect(r.imageUrl).toBe('https://example.test/vang.jpg');
    expect(r.hoverImageUrl).toBe('https://example.test/xanh-1.jpg');
  });

  it('san pham khong co anh cua mau dang loc: ve anh mac dinh, khong lo', () => {
    const r = toProductResponse(multiColorRow, { preferFamily: 'hong' });
    expect(r.imageUrl).toBe('https://example.test/vang.jpg');
    expect(r.hoverImageUrl).toBe('https://example.test/xanh-1.jpg');
  });

  it('anh re chuot khong trung anh chinh khi ho mau chi co mot anh', () => {
    const oneBlue = row({
      images: [
        image('https://example.test/vang.jpg', 'Vàng'),
        image('https://example.test/xanh.jpg', 'Xanh dương'),
      ],
    });
    const r = toProductResponse(oneBlue, { preferFamily: 'xanh-duong' });
    expect(r.imageUrl).toBe('https://example.test/xanh.jpg');
    expect(r.hoverImageUrl).toBe('https://example.test/vang.jpg');
  });
});

describe('preferredFamilyOf: chi uu tien khi loc dung mot ho mau', () => {
  it('mot ho hop le → uu tien; hai ho hoac gia tri la → khong', () => {
    expect(preferredFamilyOf(['xanh-duong'])).toBe('xanh-duong');
    expect(preferredFamilyOf(['den', 'trang'])).toBeUndefined();
    expect(preferredFamilyOf(undefined)).toBeUndefined();
    expect(preferredFamilyOf(['khong-phai-ho'])).toBeUndefined();
  });
});
