import { describe, expect, it } from 'vitest';

import { removeTokens } from './remove-tokens.js';

describe('removeTokens (UC-03.2)', () => {
  it('bo dung cac tu da tao ra y va giu nguyen phan con lai', () => {
    expect(removeTokens('polo nữ trắng dưới 100k', [1])).toBe('polo trắng dưới 100k');
    expect(removeTokens('polo nữ trắng dưới 100k', [3, 4])).toBe('polo nữ trắng');
  });

  it('nhieu khoang trang khong lam lech vi tri tu', () => {
    expect(removeTokens('  áo   sơ mi  trắng ', [3])).toBe('áo sơ mi');
  });

  it('khong co vi tri nao thi chi don khoang trang; bo het thi ra chuoi rong', () => {
    expect(removeTokens('áo  thun', [])).toBe('áo thun');
    expect(removeTokens('áo thun', [0, 1])).toBe('');
  });
});
