/**
 * Nap danh muc va bang tra cuu dung cho du lieu crawl that (ADR-007, docs/features/products/erd.md).
 * San pham mau chi duoc tao trong test fixtures, khong duoc nap vao storefront dev.
 */
import { Prisma, type PrismaClient } from '../../src/generated/prisma/client.js';

interface SeedLockedCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  adminManagedFields: string[];
}

export const CATEGORIES = [
  { slug: 'ao', name: 'Áo', parentSlug: null, sortOrder: 1 },
  { slug: 'quan', name: 'Quần', parentSlug: null, sortOrder: 2 },
  { slug: 'phu-kien', name: 'Phụ kiện', parentSlug: null, sortOrder: 3 },
  { slug: 'ao-thun', name: 'Áo thun', parentSlug: 'ao', sortOrder: 1 },
  { slug: 'ao-so-mi', name: 'Áo sơ mi', parentSlug: 'ao', sortOrder: 2 },
  { slug: 'ao-khoac', name: 'Áo khoác', parentSlug: 'ao', sortOrder: 3 },
  { slug: 'quan-dai', name: 'Quần dài', parentSlug: 'quan', sortOrder: 1 },
  { slug: 'quan-short', name: 'Quần short', parentSlug: 'quan', sortOrder: 2 },
  { slug: 'mu', name: 'Mũ', parentSlug: 'phu-kien', sortOrder: 1 },
  { slug: 'that-lung', name: 'Thắt lưng', parentSlug: 'phu-kien', sortOrder: 2 },
] as const;

export const BRANDS = [
  { slug: 'freya-basic', name: 'Freya Basic' },
  { slug: 'urban-line', name: 'Urban Line' },
  { slug: 'moc', name: 'Mộc' },
] as const;

export const COLORS = [
  { code: 'den', name: 'Đen', hex: '#111111' },
  { code: 'trang', name: 'Trắng', hex: '#FFFFFF' },
  { code: 'be', name: 'Be', hex: '#D8C8B0' },
  { code: 'xanh-navy', name: 'Xanh navy', hex: '#1F2A44' },
  { code: 'xam', name: 'Xám', hex: '#8A8A8A' },
  // Mau cua san pham khong phan loai theo mau; giao dien khong hien o mau nay.
  { code: 'mac-dinh', name: 'Mặc định', hex: null },
] as const;

// sort_order quyet thu tu nut co: sap theo chu se ra L, M, S, XL.
export const SIZES = [
  { code: 'XS', sortOrder: 10 },
  { code: 'S', sortOrder: 20 },
  { code: 'M', sortOrder: 30 },
  { code: 'L', sortOrder: 40 },
  { code: 'XL', sortOrder: 50 },
  { code: '29', sortOrder: 120 },
  { code: '30', sortOrder: 130 },
  { code: '31', sortOrder: 140 },
  { code: '32', sortOrder: 150 },
  // Co cua san pham khong phan loai theo co.
  { code: 'FREE', sortOrder: 900 },
] as const;

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<{ categories: number; brands: number; colors: number; sizes: number }> {
  // Danh muc cha truoc, con sau, de noi duoc parent theo slug.
  // Khong bat lai isActive cua danh muc da bi admin an; bao ve cac truong trong adminManagedFields
  // va khoa dong FOR UPDATE theo thu tu UUID trong transaction ReadCommitted.
  for (const c of [...CATEGORIES].sort((a, b) => Number(!!a.parentSlug) - Number(!!b.parentSlug))) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const existingHint = await tx.category.findUnique({
              where: { slug: c.slug },
              select: { id: true, parentId: true },
            });
            const parentHint = c.parentSlug
              ? await tx.category.findUnique({
                  where: { slug: c.parentSlug },
                  select: { id: true },
                })
              : null;

            const lockIds = [
              ...new Set(
                [existingHint?.id, existingHint?.parentId, parentHint?.id].filter(
                  (id): id is string => Boolean(id),
                ),
              ),
            ].sort();

            const lockedRows =
              lockIds.length > 0
                ? await tx.$queryRaw<SeedLockedCategory[]>`
                    SELECT id, name, slug, parent_id AS "parentId", sort_order AS "sortOrder",
                           is_active AS "isActive", admin_managed_fields AS "adminManagedFields"
                    FROM public.categories
                    WHERE id = ANY(${lockIds}::uuid[])
                    ORDER BY id ASC
                    FOR UPDATE
                  `
                : [];
            const lockedMap = new Map(lockedRows.map((row) => [row.id, row]));

            const existing = existingHint ? lockedMap.get(existingHint.id) : undefined;
            const targetParent = parentHint ? lockedMap.get(parentHint.id) : undefined;

            if (!existing) {
              if (c.parentSlug && !targetParent) {
                console.warn(
                  `[seedCatalog] Bỏ qua tạo danh mục "${c.slug}": không tìm thấy cha "${c.parentSlug}".`,
                );
                return;
              }
              if (targetParent) {
                if (targetParent.parentId !== null) {
                  console.warn(
                    `[seedCatalog] Bỏ qua tạo danh mục con "${c.slug}": cha "${c.parentSlug}" đang là danh mục cấp 2.`,
                  );
                  return;
                }
                const parentProducts = await tx.product.count({
                  where: { categoryId: targetParent.id },
                });
                if (parentProducts > 0) {
                  console.warn(
                    `[seedCatalog] Bỏ qua tạo danh mục con "${c.slug}": cha "${c.parentSlug}" đang có sản phẩm trực tiếp.`,
                  );
                  return;
                }
              }
              await tx.category.create({
                data: {
                  slug: c.slug,
                  name: c.name,
                  sortOrder: c.sortOrder,
                  parentId: targetParent?.id ?? null,
                },
              });
              return;
            }

            if (existing.parentId && !lockedMap.has(existing.parentId)) {
              const retryErr = new Error('Tập khóa seed thay đổi trong lúc chờ khóa');
              (retryErr as unknown as { code: string }).code = '40P01';
              throw retryErr;
            }

            const managed = new Set(existing.adminManagedFields);
            const nextName = managed.has('name') ? existing.name : c.name;
            const nextSortOrder = managed.has('sortOrder') ? existing.sortOrder : c.sortOrder;

            let nextParentId = existing.parentId;
            if (!managed.has('parentId')) {
              const desiredParentId = targetParent?.id ?? null;
              if (desiredParentId !== existing.parentId) {
                if (desiredParentId === null) {
                  nextParentId = null;
                } else if (!targetParent) {
                  console.warn(
                    `[seedCatalog] Bỏ qua đổi cha cho "${c.slug}": cha "${c.parentSlug}" không tồn tại.`,
                  );
                } else {
                  const childCount = await tx.category.count({
                    where: { parentId: existing.id },
                  });
                  const parentProducts = await tx.product.count({
                    where: { categoryId: targetParent.id },
                  });
                  if (childCount > 0 || targetParent.parentId !== null || parentProducts > 0) {
                    console.warn(
                      `[seedCatalog] Bỏ qua đổi cha cho "${c.slug}" -> "${c.parentSlug}" vì xung đột cấu trúc cây 2 cấp / sản phẩm hiện tại.`,
                    );
                  } else {
                    nextParentId = desiredParentId;
                  }
                }
              }
            }

            const metadataChanged =
              existing.name !== nextName ||
              existing.sortOrder !== nextSortOrder ||
              existing.parentId !== nextParentId;

            if (metadataChanged) {
              await tx.$executeRaw`
                UPDATE public.categories
                SET name = ${nextName},
                    sort_order = ${nextSortOrder},
                    parent_id = ${nextParentId}::uuid,
                    updated_at = GREATEST(NOW(), updated_at + INTERVAL '1 millisecond')
                WHERE id = ${existing.id}::uuid
              `;
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
        break;
      } catch (err) {
        const code =
          (err as { code?: string; meta?: { code?: string } })?.code ??
          (err as { meta?: { code?: string } })?.meta?.code;
        if (attempt < 3 && (code === '40P01' || code === '40001' || code === 'P2034')) {
          await new Promise((r) => setTimeout(r, 10 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  for (const b of BRANDS) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: { name: b.name }, create: b });
  }
  for (const c of COLORS) {
    await prisma.color.upsert({
      where: { code: c.code },
      update: { name: c.name, hex: c.hex },
      create: c,
    });
  }
  for (const s of SIZES) {
    await prisma.size.upsert({
      where: { code: s.code },
      update: { sortOrder: s.sortOrder },
      create: s,
    });
  }

  return {
    categories: CATEGORIES.length,
    brands: BRANDS.length,
    colors: COLORS.length,
    sizes: SIZES.length,
  };
}
