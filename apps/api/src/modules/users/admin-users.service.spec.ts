import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageQuery } from '../../common/pagination/page.query.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminUsersService } from './admin-users.service.js';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'khach@example.test',
  status: 'ACTIVE',
  emailVerifiedAt: new Date('2026-09-30T01:02:03.000Z'),
  createdAt: new Date('2026-09-29T00:00:00.000Z'),
  userRoles: [{ role: { code: 'CUSTOMER' } }, { role: { code: 'ADMIN' } }],
  ...overrides,
});

function makePrisma() {
  const prisma = {
    user: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
  };
  return { prisma, service: new AdminUsersService(prisma as unknown as PrismaService) };
}

const query = (page: number, pageSize: number): PageQuery =>
  Object.assign(new PageQuery(), { page, pageSize });

describe('AdminUsersService (UC-02.1 quan tri tai khoan, Admin.1)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: AdminUsersService;

  beforeEach(() => {
    ({ prisma, service } = makePrisma());
  });

  it('chi select cac cot trong allowlist, khong bao gio doc passwordHash hay authVersion', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.list(query(1, 12));

    const { select } = prisma.user.findMany.mock.calls[0]![0];
    expect(Object.keys(select).sort()).toEqual([
      'createdAt',
      'email',
      'emailVerifiedAt',
      'id',
      'status',
      'userRoles',
    ]);
    expect(select).not.toHaveProperty('passwordHash');
    expect(select).not.toHaveProperty('authVersion');
    expect(select).not.toHaveProperty('refreshTokens');
    expect(select).not.toHaveProperty('otpCodes');
  });

  it('phan trang bang skip/take, moi nhat truoc, id pha hoa, dem trong cung giao dich', async () => {
    prisma.user.count.mockResolvedValue(5);
    prisma.user.findMany.mockResolvedValue([row()]);

    const page = await service.list(query(2, 2));

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 2,
        take: 2,
      }),
    );
    expect(page).toMatchObject({ total: 5, page: 2, pageSize: 2, totalPages: 3 });
  });

  it('tra dang an toan: vai xep abc, thoi diem la chuoi ISO, chua xac thuc thi null', async () => {
    prisma.user.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      row(),
      row({ id: '00000000-0000-4000-8000-000000000002', emailVerifiedAt: null, userRoles: [] }),
    ]);

    const { items } = await service.list(query(1, 12));

    expect(items[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'khach@example.test',
      status: 'ACTIVE',
      roles: ['ADMIN', 'CUSTOMER'],
      emailVerifiedAt: '2026-09-30T01:02:03.000Z',
      createdAt: '2026-09-29T00:00:00.000Z',
    });
    expect(items[1]).toMatchObject({ emailVerifiedAt: null, roles: [] });
  });

  it('xem mot tai khoan theo id', async () => {
    prisma.user.findUnique.mockResolvedValue(row());

    await expect(service.findById(row().id)).resolves.toMatchObject({ id: row().id });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: row().id } }),
    );
  });

  it('id khong ton tai thi 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById(row().id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
