import { readFileSync } from 'node:fs';

import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OrderStatus } from '../../generated/prisma/client.js';
import { ADMIN_ORDER_STATUSES, ListAdminOrdersQuery } from './dto/admin-orders.dto.js';

describe('ListAdminOrdersQuery', () => {
  it('danh sach trang thai khai lai khop enum OrderStatus cua Prisma', () => {
    expect([...ADMIN_ORDER_STATUSES].sort()).toEqual(Object.values(OrderStatus).sort());
  });

  it('UC-12.1/AC7 status nhieu gia tri cach dau phay, attention chi nhan true/false', () => {
    const ok = plainToInstance(ListAdminOrdersQuery, {
      status: 'PROCESSING, SHIPPED',
      attention: 'true',
    });
    expect(validateSync(ok)).toHaveLength(0);
    expect(ok).toMatchObject({ status: ['PROCESSING', 'SHIPPED'], attention: true, page: 1 });
    const bad = plainToInstance(ListAdminOrdersQuery, {
      status: 'PROCESSING,NOPE',
      attention: '1',
    });
    expect(
      validateSync(bad)
        .map((error) => error.property)
        .sort(),
    ).toEqual(['attention', 'status']);
  });

  it('CODEX_REVIEW92 overview orders request must satisfy real API whitelist without frontend tab', async () => {
    const source = readFileSync('../web/src/features/overview/admin-overview.api.ts', 'utf8');
    const endpoint = source.match(/orders: '([^']+)'/)![1]!;
    const query = Object.fromEntries(new URL(endpoint, 'http://test.local').searchParams);
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    });
    // Query hop le khong chua tab phai duoc chap nhan
    await expect(
      pipe.transform(query, { type: 'query', metatype: ListAdminOrdersQuery }),
    ).resolves.toBeDefined();

    // Query chua tab la state rieng cua web, phai bi chan boi forbidNonWhitelisted
    await expect(
      pipe.transform({ ...query, tab: 'all' }, { type: 'query', metatype: ListAdminOrdersQuery }),
    ).rejects.toSatisfy((err: unknown) => {
      const res = (err as { getResponse?: () => { message?: string[] } }).getResponse?.();
      return Array.isArray(res?.message) && res.message.includes('property tab should not exist');
    });
  });
});
