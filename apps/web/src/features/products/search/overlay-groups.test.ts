import { describe, expect, it } from 'vitest';

import { categoryTree, suggestion } from '../test-support/catalog-fixtures.js';
import { buildGroups, describeUnderstanding } from './overlay-groups.js';

const titles = (groups: ReturnType<typeof buildGroups>) => groups.map((g) => g.title);

describe('buildGroups (UC-03.2)', () => {
  it('o trong: gan day, thu hoi, danh muc; danh muc rong bi an; id lien tuc', () => {
    const groups = buildGroups(
      { text: '', recent: ['sơ mi'], categories: categoryTree, suggestion: undefined },
      'ov',
    );
    expect(titles(groups)).toEqual(['Tìm gần đây', 'Thử hỏi', 'Danh mục']);
    const names = groups.flatMap((g) => g.options.map((o) => o.primary));
    expect(names).not.toContain('Đồ rỗng');
    const ids = groups.flatMap((g) => g.options.map((o) => o.id));
    expect(ids).toEqual(ids.map((_, i) => `ov-${i}`));
  });

  it('o trong khong co cau gan day thi khong co nhom do', () => {
    const groups = buildGroups(
      { text: '', recent: [], categories: [], suggestion: undefined },
      'ov',
    );
    expect(titles(groups)).toEqual(['Thử hỏi']);
  });

  it('co chu nhung chua co goi y: chi con dong "Xem tat ca ket qua"', () => {
    const groups = buildGroups(
      { text: 'polo', recent: [], categories: categoryTree, suggestion: undefined },
      'ov',
    );
    expect(titles(groups)).toEqual(['Tìm kiếm']);
    expect(groups[0]?.options[0]).toMatchObject({
      action: { type: 'query', value: 'polo' },
      primary: 'Xem tất cả kết quả cho “polo”',
    });
  });

  it('co goi y: tim kiem, goi y, danh muc, san pham; san pham tro toi trang chi tiet', () => {
    const groups = buildGroups({ text: 'polo', recent: [], categories: [], suggestion }, 'ov');
    expect(titles(groups)).toEqual(['Tìm kiếm', 'Gợi ý', 'Danh mục', 'Sản phẩm']);
    const search = groups[0]?.options[0];
    expect(search?.secondary).toBe('Đã hiểu: Áo polo · Nữ · Màu trắng · Dưới 100.000 ₫');
    expect(search?.trailing).toBe('6 sp ↵');
    const product = groups[3]?.options[0];
    expect(product?.action).toEqual({ type: 'product', slug: 'ao-polo-nu-coolmax' });
    expect(product?.trailing).toMatch(/89\.000/);
  });

  it('nhom rong khong xuat hien', () => {
    const groups = buildGroups(
      {
        text: 'polo',
        recent: [],
        categories: [],
        suggestion: { ...suggestion, products: [], categories: [], queries: [] },
      },
      'ov',
    );
    expect(titles(groups)).toEqual(['Tìm kiếm']);
  });
});

describe('describeUnderstanding', () => {
  it('khong hieu y nao thi noi tim theo chu; co noi truy van thi noi da bo gi', () => {
    expect(describeUnderstanding(undefined)).toBe('');
    const bare = { ...suggestion, interpretation: { ...suggestion.interpretation, chips: [] } };
    expect(describeUnderstanding(bare)).toBe('Tìm theo chữ');
    expect(describeUnderstanding({ ...bare, relaxed: ['bỏ lọc giá'] })).toBe(
      'Tìm theo chữ · đã bỏ lọc giá',
    );
  });
});
