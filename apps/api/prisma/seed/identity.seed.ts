import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** Role catalog belongs to Identity. Codes are stable public authorization values. */
export const IDENTITY_ROLES = [{ code: 'CUSTOMER', name: 'Customer' }] as const;

/**
 * Seeds are idempotent so development and HTTP-test databases can be rebuilt safely.
 */
export async function seedIdentity(prisma: PrismaClient): Promise<{ roles: number }> {
  for (const role of IDENTITY_ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  return { roles: IDENTITY_ROLES.length };
}
