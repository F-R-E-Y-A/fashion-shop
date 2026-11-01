import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core';

import { SessionChangedError } from '../session-sync.js';
import { classifyAdminError, shouldRetryAdminQuery } from './admin-errors.js';
import { adminUserKeys } from './admin-users.api.js';
import {
  DEFAULT_USER_LIST_QUERY,
  MAX_PAGE_PARAM,
  parsePageParam,
  readListReturn,
  usersListPath,
} from './list-query.js';
import { hasAdminRole, statusLabel, userActionFor } from './user-labels.js';

const apiError = (statusCode: number, code = 'X') =>
  new ApiError({ statusCode, code, message: code, path: '/api', timestamp: '' });

const user = (overrides: Partial<Parameters<typeof userActionFor>[0]> = {}) => ({
  id: 'target',
  email: 'muc-tieu@example.test',
  status: 'ACTIVE',
  roles: ['CUSTOMER'],
  emailVerifiedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

describe('UC-02.1 Quản trị tài khoản: luật thuần của giao diện', () => {
  it('UC-02.1/AC2 page chỉ nhận số nguyên dương an toàn; thiếu tham số là trang 1', () => {
    expect(parsePageParam(null)).toBeNull();
    expect(parsePageParam('1')).toBe(1);
    expect(parsePageParam('20')).toBe(20);
    expect(parsePageParam(String(MAX_PAGE_PARAM))).toBe(MAX_PAGE_PARAM);
    for (const raw of ['', '0', '-1', '01', '1.5', '1e3', 'abc', ' 2', '2 ', '0x2', '1000001']) {
      expect(parsePageParam(raw), raw).toBeUndefined();
    }
    expect(usersListPath()).toBe('/admin/users');
    expect(usersListPath({ page: 3 })).toBe('/admin/users?page=3');
  });

  it('UC-02.1/AC2 ngữ cảnh quay lại danh sách chỉ giữ ?page hợp lệ', () => {
    expect(readListReturn({ listSearch: '?page=4' })).toBe('/admin/users?page=4');
    expect(readListReturn({ listSearch: '?page=0' })).toBe('/admin/users');
    expect(readListReturn({ listSearch: '//evil.example/?page=2' })).toBe('/admin/users');
    expect(readListReturn({ listSearch: 42 })).toBe('/admin/users');
    expect(readListReturn(null)).toBe('/admin/users');
  });

  it('UC-02.1/AC4 ma trận thao tác: chỉ khóa ACTIVE không phải mình, không phải ADMIN', () => {
    expect(userActionFor(user(), 'actor')).toEqual({ kind: 'lock' });
    expect(userActionFor(user({ id: 'actor' }), 'actor')).toEqual({ kind: 'none', reason: 'self' });
    expect(userActionFor(user({ roles: ['ADMIN'] }), 'actor')).toEqual({
      kind: 'none',
      reason: 'admin',
    });
    expect(userActionFor(user({ status: 'PENDING_VERIFICATION' }), 'actor')).toEqual({
      kind: 'none',
      reason: 'status',
    });
    expect(userActionFor(user({ status: 'DISABLED' }), 'actor')).toEqual({
      kind: 'none',
      reason: 'status',
    });
    expect(userActionFor(user({ status: 'LOCKED' }), 'actor')).toEqual({ kind: 'unlock' });
    expect(userActionFor(user({ status: 'LOCKED', roles: ['ADMIN'] }), 'actor')).toEqual({
      kind: 'unlock',
    });
  });

  it('UC-02.1/AC3 nhãn tiếng Việt, mã lạ hiện nguyên mã', () => {
    expect(statusLabel('LOCKED')).toBe('Đã khóa');
    expect(statusLabel('ARCHIVED')).toBe('ARCHIVED');
    expect(hasAdminRole({ roles: ['CUSTOMER', 'ADMIN'] })).toBe(true);
    expect(hasAdminRole({ roles: ['CUSTOMER'] })).toBe(false);
    expect(hasAdminRole(null)).toBe(false);
  });

  it('UC-02.1/AC6 không tự thử lại 4xx hay đổi phiên; 5xx và lỗi mạng thử lại đúng một lần', () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryAdminQuery(0, apiError(status)), String(status)).toBe(false);
    }
    expect(shouldRetryAdminQuery(0, new SessionChangedError())).toBe(false);
    expect(shouldRetryAdminQuery(0, new DOMException('x', 'AbortError'))).toBe(false);
    expect(shouldRetryAdminQuery(0, apiError(500))).toBe(true);
    expect(shouldRetryAdminQuery(1, apiError(500))).toBe(false);
    expect(shouldRetryAdminQuery(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('UC-02.1/AC6 phân loại lỗi; POST hết giờ, mất mạng hay 5xx là chưa rõ kết quả', () => {
    expect(classifyAdminError(apiError(400), 'detail')).toBe('not-found');
    expect(classifyAdminError(apiError(400), 'list')).toBe('invalid');
    expect(classifyAdminError(apiError(404), 'detail')).toBe('not-found');
    expect(classifyAdminError(apiError(403), 'mutation')).toBe('forbidden');
    expect(classifyAdminError(apiError(409), 'mutation')).toBe('conflict');
    expect(classifyAdminError(apiError(422), 'mutation')).toBe('rejected');
    expect(classifyAdminError(apiError(401), 'mutation')).toBe('unauthenticated');
    expect(classifyAdminError(new SessionChangedError(), 'mutation')).toBe('session');
    expect(classifyAdminError(new DOMException('x', 'TimeoutError'), 'mutation')).toBe('unknown');
    expect(classifyAdminError(new TypeError('Failed to fetch'), 'mutation')).toBe('unknown');
    expect(classifyAdminError(apiError(502), 'mutation')).toBe('unknown');
    expect(classifyAdminError(apiError(502), 'list')).toBe('unavailable');
  });

  it('UC-02.1/AC8 query key gắn actorId, nhánh gốc chung để AuthProvider xóa khi đổi phiên', () => {
    const page2 = { ...DEFAULT_USER_LIST_QUERY, page: 2 };
    expect(adminUserKeys.list('a', page2)).toEqual(['admin-users', 'a', 'list', '', 2]);
    expect(adminUserKeys.detail('a', 'u')).toEqual(['admin-users', 'a', 'detail', 'u']);
    expect(adminUserKeys.list('a', page2)[1]).not.toBe(adminUserKeys.list('b', page2)[1]);
  });
});
