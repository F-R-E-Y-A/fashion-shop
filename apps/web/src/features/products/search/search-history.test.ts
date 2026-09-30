import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readRecentSearches, rememberSearch } from './search-history.js';

const KEY = 'fs:recent-searches';

describe('search-history (UC-03.2)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('luu cau moi len dau, bo cau trung khong phan biet hoa thuong, toi da 5 cau', () => {
    for (const q of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6']) rememberSearch(q);
    expect(readRecentSearches()).toEqual(['f6', 'e5', 'd4', 'c3', 'b2']);
    expect(rememberSearch('  C3 ')).toEqual(['C3', 'f6', 'e5', 'd4', 'b2']);
  });

  it('bo qua cau qua ngan', () => {
    expect(rememberSearch('a')).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('du lieu hong hoac sai hinh dang thi doc ra rong, khong nem loi', () => {
    localStorage.setItem(KEY, '{hong');
    expect(readRecentSearches()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ khong: 'phai mang' }));
    expect(readRecentSearches()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify(['ok', 3, null]));
    expect(readRecentSearches()).toEqual(['ok']);
  });

  it('localStorage chan ghi thi van tra danh sach, khong nem loi', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('day', 'QuotaExceededError');
    });
    expect(rememberSearch('quần tây')).toEqual(['quần tây']);
  });
});
