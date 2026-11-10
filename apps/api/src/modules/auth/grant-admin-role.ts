import { type PrismaClient, UserStatus } from '../../generated/prisma/client.js';
import { normalizeEmail } from './email.js';
import { RoleCode } from './role-code.js';

export type GrantAdminRoleResult =
  | { outcome: 'GRANTED' | 'ALREADY_ADMIN'; userId: string }
  | { outcome: 'INVALID_EMAIL' | 'USER_NOT_FOUND' | 'USER_NOT_ACTIVE' | 'ADMIN_ROLE_MISSING' };

/**
 * Nang mot tai khoan DA CO va dang ACTIVE len ADMIN. La duong duy nhat tao quan tri vien dau tien:
 * khong seed tai khoan admin nao (staging chay seed va co dia chi cong khai, mot mat khau co dinh o
 * do la cua mo cho ai cung vao), khong tao user, khong nhan mat khau.
 *
 * Idempotent: chen user_roles bang ON CONFLICT DO NOTHING (createMany + skipDuplicates) nen chay lai
 * chi tra ALREADY_ADMIN. Vai co hieu luc tu request ke tiep vi AuthGuard doc vai tu CSDL moi request.
 * Tra ket qua dang gia tri thay vi nem loi de script in ma loi ro rang ma khong in email.
 */
export async function grantAdminRole(
  prisma: PrismaClient,
  rawEmail: string,
): Promise<GrantAdminRoleResult> {
  const email = normalizeEmail(rawEmail);
  if (!email.includes('@')) return { outcome: 'INVALID_EMAIL' };

  return prisma.$transaction(async (transaction) => {
    // Tuan tu, khong Promise.all: mot transaction chi co mot ket noi pg.
    const adminRole = await transaction.role.findUnique({
      where: { code: RoleCode.ADMIN },
      select: { id: true },
    });
    if (!adminRole) return { outcome: 'ADMIN_ROLE_MISSING' } as const;

    const user = await transaction.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    });
    if (!user) return { outcome: 'USER_NOT_FOUND' } as const;
    if (user.status !== UserStatus.ACTIVE) return { outcome: 'USER_NOT_ACTIVE' } as const;

    const { count } = await transaction.userRole.createMany({
      data: [{ userId: user.id, roleId: adminRole.id }],
      skipDuplicates: true,
    });
    return { outcome: count === 1 ? 'GRANTED' : 'ALREADY_ADMIN', userId: user.id } as const;
  });
}
