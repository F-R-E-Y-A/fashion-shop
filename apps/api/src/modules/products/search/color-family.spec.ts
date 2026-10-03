import { describe, expect, it } from 'vitest';

import { colorFamily, FAMILIES, isColorFamily } from './color-family.js';

describe('colorFamily', () => {
  it.each([
    ['Tím than', 'navy'],
    ['Navy', 'navy'],
    ['Xanh đen', 'navy'],
    ['Kẻ xanh lục.', 'xanh-la'],
    ['Xanh Ngọc.', 'xanh-ngoc'],
    ['Xanh coban', 'xanh-duong'],
    ['Cafe 2', 'nau'],
    ['Đen chì', 'den'],
    ['Kẻ đen', 'den'],
    ['Ghi Đậm', 'xam'],
    ['Trắng kem', 'trang'],
    ['Đỏ đô', 'do'],
    ['Tím cẩm', 'tim'],
    ['Họa tiết 3', 'khac'],
  ])('UC-03.3 %s -> %s', (name, family) => {
    expect(colorFamily(name)).toBe(family);
  });

  it('UC-03.3 moi ho mau co nhan va hex 7 ky tu', () => {
    for (const [key, value] of Object.entries(FAMILIES)) {
      expect(isColorFamily(key)).toBe(true);
      expect(value.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(value.label).not.toBe('');
    }
    expect(isColorFamily('constructor')).toBe(false);
  });
});
