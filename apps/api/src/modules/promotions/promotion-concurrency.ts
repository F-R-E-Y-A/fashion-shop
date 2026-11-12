import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Khóa hàng chương trình khuyến mãi theo id bằng SELECT ... FOR UPDATE.
 * Lỗi SQL được propagate (không swallow) để đảm bảo an toàn giao dịch.
 */
export async function lockPromotion(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<{ id: string; updatedAt: Date } | undefined> {
  const rows = await tx.$queryRaw<{ id: string; updatedAt: Date }[]>`
    SELECT id, updated_at AS "updatedAt"
    FROM public.promotions WHERE id = ${id}::uuid FOR UPDATE
  `;
  return rows[0];
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}
