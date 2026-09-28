import { describe, expect, it } from 'vitest';

import type { ProductImage, ProductVariant } from '../api/index.js';
import {
  availableSizes,
  colorsWithImages,
  findVariant,
  imagesForColor,
  isDefaultOnly,
} from './variants.js';

const variants = [
  { id: '1', sku: 'A', colorCode: 'den', sizeCode: 'S', price: '100', listPrice: null },
  { id: '2', sku: 'B', colorCode: 'den', sizeCode: 'M', price: '100', listPrice: null },
  { id: '3', sku: 'C', colorCode: 'trang', sizeCode: 'S', price: '100', listPrice: null },
] satisfies ProductVariant[];
const images = [
  { url: 'common.jpg', alt: null, colorCode: null },
  { url: 'black.jpg', alt: null, colorCode: 'den' },
] satisfies ProductImage[];

describe('variants', () => {
  it('lọc cỡ theo màu', () => expect([...availableSizes(variants, 'trang')]).toEqual(['S']));
  it('tìm đúng biến thể', () => expect(findVariant(variants, 'den', 'M')?.sku).toBe('B'));
  it('màu không có ảnh riêng lấy ảnh chung', () =>
    expect(imagesForColor(images, 'trang').map((i) => i.url)).toEqual(['common.jpg']));
  it('không gán ảnh của màu khác khi không có ảnh phù hợp', () =>
    expect(imagesForColor(images.slice(1), 'trang')).toEqual([]));
  it('chỉ cho chọn màu có ảnh phù hợp khi sản phẩm có bộ ảnh riêng theo màu', () =>
    expect(
      colorsWithImages(
        [
          { code: 'den', name: 'Đen' },
          { code: 'trang', name: 'Trắng' },
        ],
        [{ url: 'black.jpg', alt: null, colorCode: 'den' }],
      ).map((color) => color.code),
    ).toEqual(['den']));
  it('không cho chọn màu nào khi ảnh chỉ thuộc màu không có trong biến thể', () =>
    expect(
      colorsWithImages(
        [{ code: 'den', name: 'Đen' }],
        [{ url: 'unknown.jpg', alt: null, colorCode: 'khac' }],
      ),
    ).toEqual([]));
  it('ẩn bộ chọn mặc định', () => {
    expect(isDefaultOnly(['FREE'], 'FREE')).toBe(true);
    expect(isDefaultOnly(['S', 'M'], 'FREE')).toBe(false);
  });
});
