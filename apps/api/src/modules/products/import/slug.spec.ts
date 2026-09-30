import { describe, expect, it } from 'vitest';

import { slugify, sourceSlug } from './slug.js';

describe('slug', () => {
  it('bỏ dấu và chuyển Đ thành d', () => {
    expect(slugify('Áo Thun Đen')).toBe('ao-thun-den');
    expect(slugify('Đầm')).toBe('dam');
  });

  it('cùng tên nhưng sourceKey khác thì slug khác', () => {
    expect(sourceSlug('Áo Thun Đen', 'YODY:1')).not.toBe(sourceSlug('Áo Thun Đen', 'YODY:2'));
  });
});
