import { Injectable, NotFoundException } from '@nestjs/common';

import type { PageQuery } from '../../common/pagination/page.query.js';
import { skipOf, toPage } from '../../common/pagination/page.response.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AdminUserListResponse, AdminUserResponse } from './dto/admin-user.response.js';

/** Allowlist cot duoc doc: them truong vao response thi phai them o day, co chu y. */
const adminUserSelect = {
  id: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { code: true } } } },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

/**
 * Doc tai khoan cho quan tri vien. Chi doc: Admin.1 chua co khoa, mo khoa hay gan vai.
 * Quyen do RequireRoles o controller ep; service khong nhan va khong tin id nguoi goi tu client.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PageQuery): Promise<AdminUserListResponse> {
    // Dem va lay trong cung mot giao dich de total khop items; id pha hoa khi trung createdAt de
    // phan trang on dinh, khong lap hay sot dong giua hai trang.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        select: adminUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: skipOf(query),
        take: query.pageSize,
      }),
    ]);

    return toPage(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async findById(id: string): Promise<AdminUserResponse> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: adminUserSelect });
    if (!row) throw new NotFoundException('Khong tim thay nguoi dung');
    return this.toResponse(row);
  }

  private toResponse(row: AdminUserRow): AdminUserResponse {
    return {
      id: row.id,
      email: row.email,
      status: row.status,
      roles: row.userRoles.map(({ role }) => role.code).sort(),
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
