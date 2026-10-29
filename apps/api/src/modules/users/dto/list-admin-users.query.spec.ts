import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ADMIN_USER_QUERY_MAX, ListAdminUsersQuery } from './list-admin-users.query.js';

async function parse(query: Record<string, unknown>) {
  const instance = plainToInstance(ListAdminUsersQuery, query);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, fields: errors.map((error) => error.property) };
}

describe('ListAdminUsersQuery (UC-02.1, Issue #48)', () => {
  it('UC-02.1/AC11 giu mac dinh PageQuery; vang moi bo loc la hop le', async () => {
    const { instance, fields } = await parse({});
    expect(fields).toEqual([]);
    expect(instance).toMatchObject({ page: 1, pageSize: 12 });
    expect(instance.q).toBeUndefined();
    expect(instance.verified).toBeUndefined();
  });

  it('UC-02.1/AC11 q trim; rong sau trim la vang; dai toi da 254 ky tu', async () => {
    expect((await parse({ q: '  Khach@Example ' })).instance.q).toBe('Khach@Example');
    expect((await parse({ q: '   ' })).instance.q).toBeUndefined();
    expect((await parse({ q: 'a'.repeat(ADMIN_USER_QUERY_MAX) })).fields).toEqual([]);
    expect((await parse({ q: 'a'.repeat(ADMIN_USER_QUERY_MAX + 1) })).fields).toEqual(['q']);
    expect((await parse({ q: ['a', 'b'] })).fields).toEqual(['q']);
  });

  it('UC-02.1/AC11 verified chi chuyen tuong minh tu chuoi true/false, khong theo Boolean()', async () => {
    expect((await parse({ verified: 'false' })).instance.verified).toBe(false);
    expect((await parse({ verified: 'true' })).instance.verified).toBe(true);
    for (const verified of ['', '0', '1', 'yes', 'False', ['true', 'false']]) {
      expect((await parse({ verified })).fields, String(verified)).toEqual(['verified']);
    }
  });

  it('UC-02.1/AC11 status, role, sort la allowlist phan biet hoa thuong; lap tham so (mang) bi tu choi', async () => {
    expect((await parse({ status: 'LOCKED', role: 'ADMIN', sort: 'email_desc' })).fields).toEqual(
      [],
    );
    expect((await parse({ status: 'locked' })).fields).toEqual(['status']);
    expect((await parse({ status: ['ACTIVE', 'LOCKED'] })).fields).toEqual(['status']);
    expect((await parse({ role: 'STAFF' })).fields).toEqual(['role']);
    expect((await parse({ sort: 'createdAt' })).fields).toEqual(['sort']);
    expect((await parse({ search: 'a' })).fields).toEqual(['search']);
  });
});
