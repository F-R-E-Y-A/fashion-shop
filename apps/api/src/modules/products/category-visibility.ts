import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';

export const ADMIN_MANAGED_CATEGORY_FIELDS = ['name', 'parentId', 'sortOrder'] as const;
export type AdminManagedCategoryField = (typeof ADMIN_MANAGED_CATEGORY_FIELDS)[number];

export interface CategoryLockedRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  adminManagedFields: string[];
  updatedAt: Date | string;
}

export class CategoryLockSetChangedError extends Error {
  constructor() {
    super('Tập danh mục cần khóa đã thay đổi trong lúc chờ khóa');
    this.name = 'CategoryLockSetChangedError';
  }
}

export function toIsoString(date: Date | string): string {
  if (date instanceof Date) return date.toISOString();
  return new Date(date).toISOString();
}

export function slugifyCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function extractDbErrorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    const rec = cur as Record<string, unknown>;
    if (typeof rec.code === 'string') codes.push(rec.code);
    if (typeof rec.sqlState === 'string') codes.push(rec.sqlState);
    if (rec.meta && typeof rec.meta === 'object') queue.push(rec.meta);
    if (rec.cause && typeof rec.cause === 'object') queue.push(rec.cause);
    if (rec.driverAdapterError && typeof rec.driverAdapterError === 'object') {
      queue.push(rec.driverAdapterError);
    }
  }
  return codes;
}

export function isRetryableTxError(error: unknown): boolean {
  if (error instanceof CategoryLockSetChangedError) return true;
  const codes = extractDbErrorCodes(error);
  return codes.some((c) => c === 'P2034' || c === '40P01' || c === '40001');
}

export function isUniqueViolationError(error: unknown): boolean {
  const codes = extractDbErrorCodes(error);
  return codes.some((c) => c === 'P2002' || c === '23505');
}

/**
 * Chạy transaction ở mức ReadCommitted với cơ chế retry toàn bộ transaction mới
 * khi gặp deadlock (40P01), serialization failure (40001 / P2034) hoặc thay đổi tập khóa.
 */
export async function runCategoryTxWithRetry<T>(
  prisma: PrismaService,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      return await prisma.$transaction((tx) => fn(tx), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      if (attempt < maxAttempts && isRetryableTxError(error)) {
        await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/** Khóa nhiều hàng Category theo thứ tự UUID tăng dần để chống deadlock. */
export async function lockCategoriesOrdered(
  tx: Prisma.TransactionClient,
  ids: Array<string | null | undefined>,
): Promise<CategoryLockedRow[]> {
  const uniqueSorted = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
  if (uniqueSorted.length === 0) return [];
  return tx.$queryRaw<CategoryLockedRow[]>`
    SELECT id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
           is_active AS "isActive", admin_managed_fields AS "adminManagedFields",
           updated_at AS "updatedAt"
    FROM public.categories
    WHERE id = ANY(${uniqueSorted}::uuid[])
    ORDER BY id ASC
    FOR UPDATE
  `;
}

/** Khóa hàng Category theo id trước khi kiểm tra CAS và cập nhật. */
export async function lockCategory(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<CategoryLockedRow | null> {
  const rows = await lockCategoriesOrdered(tx, [id]);
  return rows[0] ?? null;
}

/** Khóa hàng Category theo slug (dùng cho importProducts và seed). */
export async function lockCategoryBySlug(
  tx: Prisma.TransactionClient,
  slug: string,
): Promise<CategoryLockedRow | null> {
  const rows = await tx.$queryRaw<CategoryLockedRow[]>`
    SELECT id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
           is_active AS "isActive", admin_managed_fields AS "adminManagedFields",
           updated_at AS "updatedAt"
    FROM public.categories
    WHERE slug = ${slug}
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
              is_active AS "isActive", admin_managed_fields AS "adminManagedFields",
              updated_at AS "updatedAt"
  `;
  return rows[0] ?? null;
}

/**
 * Cập nhật đơn điệu thông tin quản trị Category (name, parentId, sortOrder, adminManagedFields)
 */
export async function updateCategoryFieldsMonotonic(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    name: string;
    parentId: string | null;
    sortOrder: number;
    adminManagedFields: string[];
  },
  expectedUpdatedAt: string,
): Promise<CategoryLockedRow | null> {
  const rows = await tx.$queryRaw<CategoryLockedRow[]>`
    UPDATE public.categories
    SET name = ${data.name},
        parent_id = ${data.parentId}::uuid,
        sort_order = ${data.sortOrder},
        admin_managed_fields = ${data.adminManagedFields}::text[],
        updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond')
    WHERE id = ${id}::uuid AND updated_at = ${expectedUpdatedAt}::timestamptz
    RETURNING id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
              is_active AS "isActive", admin_managed_fields AS "adminManagedFields",
              updated_at AS "updatedAt"
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
