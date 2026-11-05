import { describe, expect, it } from 'vitest';

import { adminUserKeys } from './admin-users.api.js';
import {
  DEFAULT_USER_LIST_QUERY,
  matchesUserListFilter,
  parseUserListSearch,
  readListReturn,
  serializeUserListQuery,
  USER_QUERY_MAX,
  userListApiParams,
  userListSignature,
} from './list-query.js';

const user = {
  id: 'u1',
  email: 'Nguyen.An@Example.test',
  status: 'LOCKED',
  roles: ['ADMIN', 'CUSTOMER'],
  emailVerifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('UC-02.1 Issue #48 — codec điều kiện danh sách', () => {
  it('UC-02.1/AC12 URL mặc định là rỗng; đọc đủ điều kiện và ghi lại đúng thứ tự cố định', () => {
    expect(parseUserListSearch('')).toEqual({ query: DEFAULT_USER_LIST_QUERY, canonical: '' });
    const { query, canonical } = parseUserListSearch(
      '?pageSize=50&page=3&sort=email_desc&verified=false&role=ADMIN&status=LOCKED&q=an%40ex',
    );
    expect(query).toEqual({
      q: 'an@ex',
      status: 'LOCKED',
      role: 'ADMIN',
      verified: false,
      sort: 'email_desc',
      page: 3,
      pageSize: 50,
    });
    expect(canonical).toBe(
      '?q=an%40ex&status=LOCKED&role=ADMIN&verified=false&sort=email_desc&page=3&pageSize=50',
    );
    expect(parseUserListSearch(canonical).canonical).toBe(canonical);
  });

  it('UC-02.1/AC12 giá trị sai, lặp tham số hay tham số lạ bị bỏ, không tới API', () => {
    const cases = [
      '?status=locked',
      '?status=STAFF',
      '?status=ACTIVE&status=LOCKED',
      '?role=STAFF',
      '?verified=yes',
      '?verified=true&verified=false',
      '?sort=name',
      '?page=0',
      '?page=abc',
      '?pageSize=30',
      '?pageSize=60',
      '?q=%20%20%20',
      '?search=a',
      '?q=a&q=b',
      '?sort=newest',
      '?pageSize=20',
      '?page=1',
    ];
    for (const search of cases) {
      expect(parseUserListSearch(search).canonical, search).toBe('');
    }
  });

  it('UC-02.1/AC12 q trim, cắt ở 254 ký tự như API; ký tự đặc biệt mã hóa đúng trong URL', () => {
    const long = `  ${'a'.repeat(300)}  `;
    expect(parseUserListSearch(`?q=${long}`).query.q).toHaveLength(USER_QUERY_MAX);
    const special = parseUserListSearch(`?q=${encodeURIComponent("50%_o'neil&x=1")}`);
    expect(special.query.q).toBe("50%_o'neil&x=1");
    expect(parseUserListSearch(special.canonical).query.q).toBe("50%_o'neil&x=1");
  });

  it('UC-02.1/AC12 tham số API luôn có page và pageSize; bộ lọc chỉ gửi khi có', () => {
    expect(userListApiParams(DEFAULT_USER_LIST_QUERY)).toBe('page=1&pageSize=20');
    expect(
      userListApiParams({ ...DEFAULT_USER_LIST_QUERY, q: 'a', verified: true, sort: 'oldest' }),
    ).toBe('page=1&pageSize=20&q=a&verified=true&sort=oldest');
  });

  it('UC-02.1/AC14 query key: chữ ký gồm mọi điều kiện trừ trang; khác actor, khác điều kiện là khác key', () => {
    const base = { ...DEFAULT_USER_LIST_QUERY, status: 'ACTIVE' as const };
    expect(userListSignature({ ...base, page: 4 })).toBe(userListSignature(base));
    expect(userListSignature({ ...base, pageSize: 50 })).not.toBe(userListSignature(base));
    expect(adminUserKeys.list('a', { ...base, page: 2 })).toEqual([
      'session',
      'admin',
      'users',
      'a',
      'list',
      '?status=ACTIVE',
      2,
    ]);
    expect(adminUserKeys.list('a', base)).not.toEqual(adminUserKeys.list('b', base));
  });

  it('UC-02.1/AC12 khớp bộ lọc phía client: q không phân biệt hoa thường, role là membership, verified theo null', () => {
    const q = (patch: Partial<typeof DEFAULT_USER_LIST_QUERY>) =>
      matchesUserListFilter(user, { ...DEFAULT_USER_LIST_QUERY, ...patch });
    expect(q({})).toBe(true);
    expect(q({ q: 'nguyen.an@' })).toBe(true);
    expect(q({ q: 'binh' })).toBe(false);
    expect(q({ status: 'LOCKED', role: 'CUSTOMER', verified: false })).toBe(true);
    expect(q({ status: 'ACTIVE' })).toBe(false);
    expect(q({ verified: true })).toBe(false);
  });

  it('UC-02.1/AC12 quay lại từ chi tiết giữ đủ điều kiện đã chuẩn hóa, bỏ chuỗi lạ', () => {
    expect(readListReturn({ listSearch: '?q=an&status=LOCKED&page=2&pageSize=10' })).toBe(
      '/admin/users?q=an&status=LOCKED&page=2&pageSize=10',
    );
    expect(readListReturn({ listSearch: '?status=hack&page=-1' })).toBe('/admin/users');
    expect(readListReturn({ listSearch: '//evil.example/?page=2' })).toBe('/admin/users');
    expect(readListReturn(undefined)).toBe('/admin/users');
    expect(serializeUserListQuery({ ...DEFAULT_USER_LIST_QUERY, page: 2 })).toBe('?page=2');
  });
});
