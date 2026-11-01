import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { OrderStatus } from '../../generated/prisma/client.js';
import { ADMIN_ORDER_STATUSES, ListAdminOrdersQuery } from './dto/admin-orders.dto.js';

describe('ListAdminOrdersQuery', () => {
  it('danh sach trang thai khai lai khop enum OrderStatus cua Prisma', () => {
    expect([...ADMIN_ORDER_STATUSES].sort()).toEqual(Object.values(OrderStatus).sort());
  });

  it('status nhieu gia tri cach dau phay, attention chi nhan true/false', () => {
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
});
