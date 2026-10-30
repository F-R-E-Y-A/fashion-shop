import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PageQuery } from '../../common/pagination/page.query.js';
import { UserStatus } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminUsersService, escapeLikePattern } from './admin-users.service.js';
import { ADMIN_USER_STATUSES, ListAdminUsersQuery } from './dto/list-admin-users.query.js';

const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa';
const TARGET_ID = '00000000-0000-4000-8000-000000000001';

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
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    // Hai dang: mang thao tac (list) va ham giao dich tuong tac (lock/unlock) nhan chinh `prisma`.
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as []),
    ),
  };
  return { prisma, service: new AdminUsersService(prisma as unknown as PrismaService) };
}

const query = (page: number, pageSize: number): PageQuery =>
  Object.assign(new PageQuery(), { page, pageSize });

const filtered = (filters: Partial<ListAdminUsersQuery>): ListAdminUsersQuery =>
  Object.assign(new ListAdminUsersQuery(), { page: 1, pageSize: 20 }, filters);

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

  it('UC-02.1/AC11 count va findMany dung CUNG where; bo loc AND, role la membership, verified theo null', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.list(
      filtered({
        q: '50%_off\\x',
        status: 'LOCKED',
        role: 'ADMIN',
        verified: false,
        sort: 'email_asc',
      }),
    );

    const where = {
      email: { contains: '50\\%\\_off\\\\x', mode: 'insensitive' },
      status: 'LOCKED',
      userRoles: { some: { role: { code: 'ADMIN' } } },
      emailVerifiedAt: null,
    };
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, orderBy: [{ email: 'asc' }, { id: 'asc' }] }),
    );
  });

  it('UC-02.1/AC11 verified=true la emailVerifiedAt khac null; khong bo loc thi where rong', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.list(filtered({ verified: true }));
    await service.list(filtered({}));

    expect(prisma.user.count.mock.calls[0]![0]).toEqual({
      where: { emailVerifiedAt: { not: null } },
    });
    expect(prisma.user.count.mock.calls[1]![0]).toEqual({ where: {} });
  });

  it('UC-02.1/AC11 bon kieu sap xep anh xa allowlist, tie-break id tang', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    const expected = {
      newest: [{ createdAt: 'desc' }, { id: 'asc' }],
      oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
      email_asc: [{ email: 'asc' }, { id: 'asc' }],
      email_desc: [{ email: 'desc' }, { id: 'asc' }],
    } as const;

    for (const [sort, orderBy] of Object.entries(expected)) {
      prisma.user.findMany.mockClear();
      await service.list(filtered({ sort: sort as keyof typeof expected }));
      expect(prisma.user.findMany.mock.calls[0]![0].orderBy).toEqual(orderBy);
    }
  });

  it('UC-02.1/AC11 trang thai khai trong DTO (DTO khong duoc doc Prisma) trung enum UserStatus', () => {
    expect([...ADMIN_USER_STATUSES].sort()).toEqual(Object.values(UserStatus).sort());
  });

  it('UC-02.1/AC11 escape \\, % va _ cua LIKE, giu nguyen ky tu khac', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLikePattern("o'neil@example.test")).toBe("o'neil@example.test");
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

describe('AdminUsersService lock/unlock (UC-02.1, Admin.2)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: AdminUsersService;

  beforeEach(() => {
    ({ prisma, service } = makePrisma());
  });

  it('tu khoa chinh minh: 422 ngay, khong mo giao dich', async () => {
    const attempt = service.lock(ADMIN_ID, ADMIN_ID);

    await expect(attempt).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(attempt).rejects.toMatchObject({
      response: { error: 'CANNOT_LOCK_SELF' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lock: chi ACTIVE -> LOCKED, tang authVersion, thu hoi refresh, ghi nhat ky khong co PII', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(row({ status: 'LOCKED' }));

    await expect(service.lock(ADMIN_ID, TARGET_ID)).resolves.toMatchObject({
      id: TARGET_ID,
      status: 'LOCKED',
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET_ID, status: 'ACTIVE' },
      data: { status: 'LOCKED', authVersion: { increment: 1 } },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: TARGET_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: ADMIN_ID,
        action: 'LOCK_USER',
        entityType: 'USER',
        entityId: TARGET_ID,
        metadata: { fromStatus: 'ACTIVE', toStatus: 'LOCKED', revokedSessions: 3 },
      },
    });
  });

  it('unlock: chi LOCKED -> ACTIVE, KHONG dong authVersion, KHONG dong refresh token', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue(row());

    await service.unlock(ADMIN_ID, TARGET_ID);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: TARGET_ID, status: 'LOCKED' },
      data: { status: 'ACTIVE' },
    });
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UNLOCK_USER',
        metadata: { fromStatus: 'LOCKED', toStatus: 'ACTIVE' },
      }),
    });
  });

  it('sai trang thai: 409 va khong thu hoi, khong ghi nhat ky', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: TARGET_ID });

    await expect(service.lock(ADMIN_ID, TARGET_ID)).rejects.toMatchObject({
      response: { error: 'USER_NOT_ACTIVE' },
    });
    await expect(service.unlock(ADMIN_ID, TARGET_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('khong co tai khoan: 404 va khong ghi nhat ky', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.lock(ADMIN_ID, TARGET_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.unlock(ADMIN_ID, TARGET_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
