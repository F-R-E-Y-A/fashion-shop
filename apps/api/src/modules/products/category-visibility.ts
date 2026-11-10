import type { Prisma } from '../../generated/prisma/client.js';

export interface CategoryLockedRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: Date | string;
}

export function toIsoString(date: Date | string): string {
  if (date instanceof Date) return date.toISOString();
  return new Date(date).toISOString();
}

/** Khóa hàng Category theo id trước khi kiểm tra CAS và cập nhật. */
export async function lockCategory(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<CategoryLockedRow | null> {
  const rows = await tx.$queryRaw<CategoryLockedRow[]>`
    SELECT id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
           is_active AS "isActive", updated_at AS "updatedAt"
    FROM public.categories
    WHERE id = ${id}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Cập nhật đơn điệu trạng thái hiển thị Category:
 * - updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond')
 * - Điều kiện CAS: WHERE id = $1 AND updated_at = $2::timestamptz
 * - Trả về hàng vừa cập nhật, hoặc null nếu không có dòng nào khớp (CAS failed)
 */
export async function updateCategoryVisibilityMonotonic(
  tx: Prisma.TransactionClient,
  id: string,
  isActive: boolean,
  expectedUpdatedAt: string,
): Promise<CategoryLockedRow | null> {
  const rows = await tx.$queryRaw<CategoryLockedRow[]>`
    UPDATE public.categories
    SET is_active = ${isActive},
        updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond')
    WHERE id = ${id}::uuid AND updated_at = ${expectedUpdatedAt}::timestamptz
    RETURNING id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
              is_active AS "isActive", updated_at AS "updatedAt"
  `;
  return rows[0] ?? null;
}

export function computeHierarchyVisibility(
  category: { isActive: boolean; parentId: string | null },
  parent: { isActive: boolean } | null,
): { effectiveActive: boolean; parentHidden: boolean } {
  const parentHidden = Boolean(category.parentId && parent && !parent.isActive);
  const effectiveActive = category.isActive && (!parent || parent.isActive);
  return { effectiveActive, parentHidden };
}
