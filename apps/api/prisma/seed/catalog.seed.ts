/**
 * Du lieu gia danh muc theo mo hinh M2 (ADR-007, docs/features/products/erd.md).
 * Khoa nghiep vu giu seed chay lai khong trung: slug danh muc, thuong hieu, san pham; ma mau, ma co; SKU.
 * Moi san pham co it nhat mot bien the; san pham khong phan loai dung co FREE va mau mac-dinh.
 * Bai kiem thu import hang so o day thay vi go lai so.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

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

type ColorCode = (typeof COLORS)[number]['code'];
type SizeCode = (typeof SIZES)[number]['code'];

interface ProductSeed {
  slug: string;
  name: string;
  categorySlug: (typeof CATEGORIES)[number]['slug'];
  brandSlug: (typeof BRANDS)[number]['slug'];
  skuPrefix: string;
  listPrice: number;
  /** Gia khuyen mai theo mau; mau khong co trong day thi ban gia niem yet. */
  salePriceByColor?: Partial<Record<ColorCode, number>>;
  colors: ColorCode[];
  sizes: SizeCode[];
  material: string;
  isFeatured?: boolean;
}

export const PRODUCTS: readonly ProductSeed[] = [
  {
    slug: 'ao-thun-co-tron-basic',
    name: 'Ao thun co tron basic',
    categorySlug: 'ao-thun',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-001',
    listPrice: 199000,
    salePriceByColor: { trang: 179000 },
    colors: ['den', 'trang'],
    sizes: ['S', 'M', 'L'],
    material: 'Cotton 100%',
  },
  {
    slug: 'ao-so-mi-linen-tay-dai',
    name: 'Ao so mi linen tay dai',
    categorySlug: 'ao-so-mi',
    brandSlug: 'moc',
    skuPrefix: 'SEED-002',
    listPrice: 459000,
    colors: ['be', 'trang'],
    sizes: ['M', 'L'],
    material: 'Linen',
  },
  {
    slug: 'ao-khoac-du-hai-lop',
    name: 'Ao khoac du hai lop',
    categorySlug: 'ao-khoac',
    brandSlug: 'urban-line',
    skuPrefix: 'SEED-003',
    listPrice: 689000,
    salePriceByColor: { den: 599000 },
    colors: ['den'],
    sizes: ['M', 'L', 'XL'],
    material: 'Polyester chống thấm',
    isFeatured: true,
  },
  {
    slug: 'ao-polo-cotton-pique',
    name: 'Ao polo cotton pique',
    categorySlug: 'ao-thun',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-004',
    listPrice: 329000,
    colors: ['xanh-navy', 'trang'],
    sizes: ['S', 'M', 'L'],
    material: 'Cotton pique',
  },
  {
    slug: 'quan-jean-ong-suong',
    name: 'Quan jean ong suong',
    categorySlug: 'quan-dai',
    brandSlug: 'urban-line',
    skuPrefix: 'SEED-005',
    listPrice: 549000,
    colors: ['xanh-navy'],
    sizes: ['29', '30', '31', '32'],
    material: 'Denim',
    isFeatured: true,
  },
  {
    slug: 'quan-kaki-tui-hop',
    name: 'Quan kaki tui hop',
    categorySlug: 'quan-dai',
    brandSlug: 'moc',
    skuPrefix: 'SEED-006',
    listPrice: 429000,
    colors: ['be', 'den'],
    sizes: ['29', '30', '31'],
    material: 'Kaki cotton',
  },
  {
    slug: 'quan-short-the-thao',
    name: 'Quan short the thao',
    categorySlug: 'quan-short',
    brandSlug: 'urban-line',
    skuPrefix: 'SEED-007',
    listPrice: 259000,
    colors: ['den', 'xam'],
    sizes: ['S', 'M', 'L'],
    material: 'Polyester co giãn',
  },
  {
    slug: 'quan-tay-cong-so',
    name: 'Quan tay cong so',
    categorySlug: 'quan-dai',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-008',
    listPrice: 479000,
    colors: ['den', 'xam'],
    sizes: ['29', '30', '31', '32'],
    material: 'Vải tuýt',
  },
  {
    slug: 'mu-luoi-trai-canvas',
    name: 'Mu luoi trai canvas',
    categorySlug: 'mu',
    brandSlug: 'moc',
    skuPrefix: 'SEED-009',
    listPrice: 149000,
    colors: ['den', 'be'],
    sizes: ['FREE'],
    material: 'Canvas',
    isFeatured: true,
  },
  {
    // San pham khong phan loai: dung mot bien the mac dinh (co FREE, mau mac-dinh).
    slug: 'that-lung-da-bo',
    name: 'That lung da bo',
    categorySlug: 'that-lung',
    brandSlug: 'moc',
    skuPrefix: 'SEED-010',
    listPrice: 359000,
    colors: ['mac-dinh'],
    sizes: ['FREE'],
    material: 'Da bò',
  },
];

const colorName = (code: ColorCode): string => COLORS.find((c) => c.code === code)?.name ?? code;

/** Gia ban mot bien the: gia khuyen mai neu co, khong thi gia niem yet. */
export const salePriceOf = (p: ProductSeed, color: ColorCode): number | null =>
  p.salePriceByColor?.[color] ?? null;

/** Gia thap nhat trong cac bien the dang ban, dung la gia tri cot price_from. */
export const priceFromOf = (p: ProductSeed): number =>
  Math.min(...p.colors.map((color) => salePriceOf(p, color) ?? p.listPrice));

export const skuOf = (p: ProductSeed, color: ColorCode, size: SizeCode): string =>
  `${p.skuPrefix}-${color.toUpperCase()}-${size}`;

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<{ categories: number; products: number; productVariants: number }> {
  // Danh muc cha truoc, con sau, de noi duoc parent theo slug.
  for (const c of [...CATEGORIES].sort((a, b) => Number(!!a.parentSlug) - Number(!!b.parentSlug))) {
    const parent = c.parentSlug ? { connect: { slug: c.parentSlug } } : undefined;
    await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: c.sortOrder, isActive: true, parent },
      create: { slug: c.slug, name: c.name, sortOrder: c.sortOrder, parent },
    });
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

  for (const p of PRODUCTS) {
    const data = {
      name: p.name,
      description: `${p.name}. Du lieu gia de thu giao dien, thay bang du lieu that khi nap tu HT-03.`,
      material: p.material,
      careInstructions: 'Giặt máy ở 30 độ, không dùng chất tẩy.',
      priceFrom: priceFromOf(p),
      isActive: true,
      isFeatured: p.isFeatured ?? false,
      category: { connect: { slug: p.categorySlug } },
      brand: { connect: { slug: p.brandSlug } },
    };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: data,
      create: { slug: p.slug, ...data },
    });

    for (const color of p.colors) {
      for (const size of p.sizes) {
        const variant = {
          listPrice: p.listPrice,
          salePrice: salePriceOf(p, color),
          isActive: true,
          product: { connect: { id: product.id } },
          color: { connect: { code: color } },
          size: { connect: { code: size } },
        };
        await prisma.productVariant.upsert({
          where: { sku: skuOf(p, color, size) },
          update: variant,
          create: { sku: skuOf(p, color, size), ...variant },
        });
      }
    }

    // Anh 0 dung chung moi mau; anh 1..n gan voi tung mau. San pham mau mac-dinh chi co anh chung.
    const images = [
      { sortOrder: 0, color: null as ColorCode | null },
      ...p.colors.filter((c) => c !== 'mac-dinh').map((c, i) => ({ sortOrder: i + 1, color: c })),
    ];
    for (const img of images) {
      const imageData = {
        url: `https://picsum.photos/seed/${p.slug}-${img.color ?? 'chung'}/600/800`,
        alt: img.color ? `${p.name} màu ${colorName(img.color)}` : p.name,
        color: img.color ? { connect: { code: img.color } } : { disconnect: true },
      };
      await prisma.productImage.upsert({
        where: { productId_sortOrder: { productId: product.id, sortOrder: img.sortOrder } },
        update: imageData,
        create: {
          product: { connect: { id: product.id } },
          sortOrder: img.sortOrder,
          url: imageData.url,
          alt: imageData.alt,
          ...(img.color ? { color: { connect: { code: img.color } } } : {}),
        },
      });
    }
  }

  const [categories, products, productVariants] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);
  return { categories, products, productVariants };
}
