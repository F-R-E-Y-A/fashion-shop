import { Prisma } from '../../generated/prisma/client.js';
import type { ProductResponse } from './dto/product.response.js';

/**
 * Phan dung chung cua "san pham hien thi tren cua hang": dieu kien hien thi, phan lay ve cho the
 * san pham, va cach dung ProductResponse. ProductsService (duong liet ke co ban) va
 * CatalogSearchService (duong tim kiem, loc) cung dung, de hai duong khong bao gio lech nhau ve
 * chuyen "san pham nao duoc hien" hay "gia hien the nao".
 */

// Gia lay tu products.price_from (gia ban thap nhat, service tinh lai khi ghi bien the, ADR-007),
// nen khong can truy van phu tim bien the re nhat cho moi dong.
export const storefrontProductInclude = {
  category: true,
  brand: { select: { name: true } },
  variants: {
    where: { isActive: true },
    select: { listPrice: true, salePrice: true },
  },
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true },
  },
} as const;

/** Danh muc hien thi duoc: dang bat, va danh muc cha (neu co) cung dang bat. */
export const visibleCategory: Prisma.CategoryWhereInput = {
  isActive: true,
  OR: [{ parentId: null }, { parent: { isActive: true } }],
};

/**
 * San pham hien thi duoc: dang ban, co it nhat mot bien the dang ban, co it nhat mot anh, danh muc
 * hien thi duoc. `extra` ghi de tung khoa (vd `category` khi loc theo danh muc).
 */
export function storefrontProductWhere(
  extra: Prisma.ProductWhereInput = {},
): Prisma.ProductWhereInput {
  return {
    isActive: true,
    variants: { some: { isActive: true } },
    images: { some: {} },
    category: visibleCategory,
    ...extra,
  };
}

function listPriceOf(
  variants: Array<{ listPrice: Prisma.Decimal; salePrice: Prisma.Decimal | null }>,
  priceFrom: Prisma.Decimal,
): string | null {
  const discounted = variants.find((variant) => variant.salePrice?.equals(priceFrom));
  return discounted?.listPrice.toString() ?? null;
}

export function toProductResponse(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: { name: string; slug: string };
  brand: { name: string } | null;
  variants: Array<{ listPrice: Prisma.Decimal; salePrice: Prisma.Decimal | null }>;
  priceFrom: Prisma.Decimal;
  images: Array<{ url: string }>;
}): ProductResponse {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    // Decimal -> chuoi, giao dien tu dinh dang. Khong tra Float.
    price: row.priceFrom.toString(),
    imageUrl: row.images[0]?.url ?? null,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    brandName: row.brand?.name ?? null,
    listPrice: listPriceOf(row.variants, row.priceFrom),
  };
}
