import type { Prisma } from '../../generated/prisma/client.js';

/** Import va admin khoa cung hang TRUOC khi doc hold/anh va ghi bien the/anh. */
export async function lockProductStatus(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<
    { id: string; isActive: boolean; adminDisabled: boolean; statusVersion: number }[]
  >`
    SELECT id, is_active AS "isActive", admin_disabled AS "adminDisabled",
      status_version AS "statusVersion"
    FROM public.products WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0];
}

export function productStatusChange(
  before: { isActive: boolean; adminDisabled: boolean },
  adminDisabled: boolean,
  hasImages: boolean,
) {
  const isActive = !adminDisabled && hasImages;
  return {
    adminDisabled,
    isActive,
    ...(before.isActive !== isActive || before.adminDisabled !== adminDisabled
      ? { statusVersion: { increment: 1 } }
      : {}),
  };
}
