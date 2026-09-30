import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { PageQuery } from '../../common/pagination/page.query.js';
import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { type Prisma, UserStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AdminAuditAction, AUDIT_ENTITY_USER } from './admin-audit.js';
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

type StatusChangeOutcome =
  { status: 'CHANGED'; user: AdminUserRow } | { status: 'NOT_FOUND' } | { status: 'WRONG_STATE' };

/**
 * Doc va khoa/mo khoa tai khoan cho quan tri vien. Quyen do RequireRoles o controller ep; id nguoi
 * thao tac (actorId) lay tu CurrentUser, khong bao gio tu than request.
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

  /**
   * ACTIVE -> LOCKED. Trong CUNG mot giao dich: doi trang thai, tang authVersion (moi access token cu
   * bi AuthGuard tu choi ngay, va KHONG song lai sau khi mo khoa vi mo khoa khong giam authVersion),
   * thu hoi moi refresh token con hieu luc (token bi thu hoi khong co replacedByTokenId nen refresh
   * luon tra 401, ke ca sau khi mo khoa), va ghi nhat ky. Khong tu khoa minh: luon con it nhat nguoi
   * dang thao tac la quan tri vien dang hoat dong.
   */
  async lock(actorId: string, targetId: string): Promise<AdminUserResponse> {
    if (actorId === targetId) {
      throw new UnprocessableEntityException({
        error: 'CANNOT_LOCK_SELF',
        message: 'Khong the tu khoa tai khoan cua chinh minh',
      });
    }

    const outcome = await this.changeStatus({
      targetId,
      from: UserStatus.ACTIVE,
      to: UserStatus.LOCKED,
      bumpAuthVersion: true,
      revokeSessions: true,
      action: AdminAuditAction.LOCK_USER,
      actorId,
    });
    return this.mapOutcome(outcome, 'USER_NOT_ACTIVE', 'Chi khoa duoc tai khoan dang hoat dong');
  }

  /**
   * LOCKED -> ACTIVE. Khong phat hanh token, khong giam authVersion, khong phuc hoi refresh token:
   * nguoi dung phai dang nhap lai tu dau.
   */
  async unlock(actorId: string, targetId: string): Promise<AdminUserResponse> {
    const outcome = await this.changeStatus({
      targetId,
      from: UserStatus.LOCKED,
      to: UserStatus.ACTIVE,
      bumpAuthVersion: false,
      revokeSessions: false,
      action: AdminAuditAction.UNLOCK_USER,
      actorId,
    });
    return this.mapOutcome(outcome, 'USER_NOT_LOCKED', 'Chi mo khoa duoc tai khoan dang bi khoa');
  }

  /**
   * Chuyen trang thai co dieu kien (`updateMany` WHERE status = from): hai yeu cau song song thi dong
   * bi khoa hang, yeu cau sau doc lai dieu kien, khop 0 dong va nhan WRONG_STATE, nen chi mot lan
   * thanh cong va chi mot dong nhat ky. Khong nem loi HTTP trong giao dich: tra ket qua roi map sau
   * khi commit (cung ky luat voi AuthService). That bai thi khong ghi gi, ke ca nhat ky.
   */
  private changeStatus(change: {
    targetId: string;
    from: UserStatus;
    to: UserStatus;
    bumpAuthVersion: boolean;
    revokeSessions: boolean;
    action: AdminAuditAction;
    actorId: string;
  }): Promise<StatusChangeOutcome> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.updateMany({
        where: { id: change.targetId, status: change.from },
        data: {
          status: change.to,
          ...(change.bumpAuthVersion ? { authVersion: { increment: 1 } } : {}),
        },
      });
      if (updated.count === 0) {
        const exists = await transaction.user.findUnique({
          where: { id: change.targetId },
          select: { id: true },
        });
        return exists ? { status: 'WRONG_STATE' } : { status: 'NOT_FOUND' };
      }

      const revoked = change.revokeSessions
        ? await transaction.refreshToken.updateMany({
            where: { userId: change.targetId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };

      // Metadata chi gom chuyen trang thai va so phien bi thu hoi: khong email, token hay than yeu cau.
      await transaction.auditLog.create({
        data: {
          actorUserId: change.actorId,
          action: change.action,
          entityType: AUDIT_ENTITY_USER,
          entityId: change.targetId,
          metadata: {
            fromStatus: change.from,
            toStatus: change.to,
            ...(change.revokeSessions ? { revokedSessions: revoked.count } : {}),
          },
        },
      });

      const user = await transaction.user.findUniqueOrThrow({
        where: { id: change.targetId },
        select: adminUserSelect,
      });
      return { status: 'CHANGED', user };
    });
  }

  private mapOutcome(
    outcome: StatusChangeOutcome,
    wrongStateCode: string,
    wrongStateMessage: string,
  ): AdminUserResponse {
    switch (outcome.status) {
      case 'CHANGED':
        return this.toResponse(outcome.user);
      case 'NOT_FOUND':
        throw new NotFoundException('Khong tim thay nguoi dung');
      case 'WRONG_STATE':
        throw new ConflictException({ error: wrongStateCode, message: wrongStateMessage });
    }
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
