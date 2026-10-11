import { Prisma } from '../../generated/prisma/client.js';
import type { ProductResponse } from './dto/product.response.js';
import { type ColorFamily, colorFamily, FAMILIES, isColorFamily } from './search/color-family.js';

/**
 * Phan dung chung cua "san pham hien thi tren cua hang": dieu kien hien thi, phan lay ve cho the
 * san pham, va cach dung ProductResponse. ProductsService (duong liet ke co ban) va
 * CatalogSearchService (duong tim kiem, loc) cung dung, de hai duong khong bao gio lech nhau ve
 * chuyen "san pham nao duoc hien" hay "gia hien the nao".
 */

/** Ma mau cua san pham khong phan loai theo mau; khong hien thanh mau tren giao dien. */
export const DEFAULT_COLOR_CODE = 'mac-dinh';

const MAX_SWATCHES = 4;

// Gia lay tu products.price_from (gia ban thap nhat, service tinh lai khi ghi bien the, ADR-007),
// nen khong can truy van phu tim bien the re nhat cho moi dong.
// Bien the xep theo ma mau de thu tu chip mau on dinh giua cac lan goi; lay hai anh dau de the
// san pham doi anh khi re chuot.
// Anh KEM TEN MAU va lay toi 12 (chu khong phai 2 nhu truoc): khi khach loc theo MOT ho mau,
// the can dung ANH CUA MAU DO thay vi anh mac dinh cua san pham (anh dau tien theo thu tu sap xep)
// nen phai du anh de chon — tranh "loc xanh duong lai ra the vang".
export const storefrontProductInclude = {
  category: true,
  brand: { select: { name: true } },
  variants: {
    where: { isActive: true },
    orderBy: [{ color: { code: 'asc' } }, { id: 'asc' }],
    select: {
      listPrice: true,
      salePrice: true,
      color: { select: { code: true, name: true } },
    },
  },
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 12,
    select: { url: true, color: { select: { name: true } } },
  },
} satisfies Prisma.ProductInclude;

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

interface RowVariant {
  listPrice: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  color?: { code?: string; name: string };
}

/** Chip mau (ma hex cua ho mau) va so ten mau, tren cac bien the co mau that (khong tinh mac dinh). */
function colorSummary(variants: RowVariant[]): { swatches: string[]; count: number } {
  const names = new Set<string>();
  const swatches: string[] = [];
  for (const variant of variants) {
    const color = variant.color;
    if (!color || color.code === DEFAULT_COLOR_CODE) continue;
    names.add(color.name);
    const hex = FAMILIES[colorFamily(color.name)].hex;
    if (!swatches.includes(hex)) swatches.push(hex);
  }
  return { swatches: swatches.slice(0, MAX_SWATCHES), count: names.size };
}

export function toProductResponse(
  row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    category: { name: string; slug: string };
    brand: { name: string } | null;
    variants: RowVariant[];
    priceFrom: Prisma.Decimal;
    images: Array<{ url: string; color?: { name: string } | null }>;
  },
  opts: { preferFamily?: ColorFamily } = {},
): ProductResponse {
  const colors = colorSummary(row.variants);
  // Dang loc theo dung mot ho mau: dung anh cua mau do lam anh chinh + anh re chuot, de the
  // khong con noi "loc xanh duong ma thay ao vang". San pham khong co anh mau do thi giu anh
  // mac dinh nhu cu.
  const familyImages = opts.preferFamily
    ? row.images.filter(
        (image) => image.color?.name && colorFamily(image.color.name) === opts.preferFamily,
      )
    : [];
  const primary = familyImages[0] ?? row.images[0];
  const hover = familyImages[1] ?? row.images.find((image) => image.url !== primary?.url) ?? null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    // Decimal -> chuoi, giao dien tu dinh dang. Khong tra Float.
    price: row.priceFrom.toString(),
    imageUrl: primary?.url ?? null,
    hoverImageUrl: hover?.url ?? null,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    brandName: row.brand?.name ?? null,
    listPrice: listPriceOf(row.variants, row.priceFrom),
    colorSwatches: colors.swatches,
    colorCount: colors.count,
  };
}

/**
 * Ho mau can uu tien cho anh the: chi khi bo loc chon DUNG MOT ho mau (co ca mau do query
 * understanding chi ra). Nhieu hon mot ho thi khong doan thay nguoi dung.
 */
export function preferredFamilyOf(colors?: string[]): ColorFamily | undefined {
  if (!colors || colors.length !== 1) return undefined;
  return isColorFamily(colors[0]) ? colors[0] : undefined;
}
