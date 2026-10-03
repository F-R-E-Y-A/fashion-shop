import { BRANDS, CATEGORIES, COLORS, SIZES } from '../../prisma/seed/catalog.seed.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

type ColorCode = (typeof COLORS)[number]['code'];
type SizeCode = (typeof SIZES)[number]['code'];

interface ProductSeed {
  slug: string;
  name: string;
  categorySlug: (typeof CATEGORIES)[number]['slug'];
  brandSlug: (typeof BRANDS)[number]['slug'];
  skuPrefix: string;
  /** Gan tay cho kiem thu: ten fixture khong noi doi tuong (ADR-019). */
  audience: 'nam' | 'nu' | 'unisex';
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
    audience: 'unisex',
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
    audience: 'nam',
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
    audience: 'nam',
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
    audience: 'nam',
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
    audience: 'nam',
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
    audience: 'nam',
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
    audience: 'nam',
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
    audience: 'nu',
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
    audience: 'unisex',
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
    audience: 'nam',
    listPrice: 359000,
    colors: ['mac-dinh'],
    sizes: ['FREE'],
    material: 'Da bò',
  },
  {
    slug: 'ao-thun-gan-co',
    name: 'Áo thun gân cổ vuông',
    categorySlug: 'ao-thun',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-011',
    audience: 'nu',
    listPrice: 289000,
    colors: ['trang', 'den'],
    sizes: ['S', 'M', 'L'],
    material: 'Cotton gân',
    isFeatured: true,
  },
  {
    slug: 'ao-so-mi-lua-mem',
    name: 'Áo sơ mi lụa mềm',
    categorySlug: 'ao-so-mi',
    brandSlug: 'moc',
    skuPrefix: 'SEED-012',
    audience: 'nu',
    listPrice: 529000,
    salePriceByColor: { be: 469000 },
    colors: ['be', 'trang'],
    sizes: ['S', 'M', 'L'],
    material: 'Lụa pha',
    isFeatured: true,
  },
  {
    slug: 'ao-khoac-tweed-ngan',
    name: 'Áo khoác tweed dáng ngắn',
    categorySlug: 'ao-khoac',
    brandSlug: 'urban-line',
    skuPrefix: 'SEED-013',
    audience: 'nu',
    listPrice: 899000,
    colors: ['den', 'be'],
    sizes: ['M', 'L'],
    material: 'Tweed',
  },
  {
    slug: 'quan-dai-ong-rong',
    name: 'Quần dài ống rộng',
    categorySlug: 'quan-dai',
    brandSlug: 'moc',
    skuPrefix: 'SEED-014',
    audience: 'nu',
    listPrice: 499000,
    salePriceByColor: { den: 449000 },
    colors: ['den', 'be'],
    sizes: ['29', '30', '31'],
    material: 'Kaki mềm',
  },
  {
    slug: 'quan-short-linen',
    name: 'Quần short linen',
    categorySlug: 'quan-short',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-015',
    audience: 'nu',
    listPrice: 329000,
    colors: ['be', 'trang'],
    sizes: ['S', 'M', 'L'],
    material: 'Linen',
  },
  {
    slug: 'mu-bucket-canvas',
    name: 'Mũ bucket canvas',
    categorySlug: 'mu',
    brandSlug: 'moc',
    skuPrefix: 'SEED-016',
    audience: 'unisex',
    listPrice: 179000,
    colors: ['den', 'be'],
    sizes: ['FREE'],
    material: 'Canvas',
  },
  {
    slug: 'that-lung-ban-nho',
    name: 'Thắt lưng bản nhỏ',
    categorySlug: 'that-lung',
    brandSlug: 'moc',
    skuPrefix: 'SEED-017',
    audience: 'nu',
    listPrice: 299000,
    colors: ['mac-dinh'],
    sizes: ['FREE'],
    material: 'Da tổng hợp',
  },
  {
    slug: 'ao-thun-cotton-tho',
    name: 'Áo thun cotton thô',
    categorySlug: 'ao-thun',
    brandSlug: 'freya-basic',
    skuPrefix: 'SEED-018',
    audience: 'unisex',
    listPrice: 259000,
    colors: ['xam', 'trang'],
    sizes: ['S', 'M', 'L'],
    material: 'Cotton',
    isFeatured: true,
  },
  {
    slug: 'quan-tay-ly-dung',
    name: 'Quần tây ly đứng',
    categorySlug: 'quan-dai',
    brandSlug: 'urban-line',
    skuPrefix: 'SEED-019',
    audience: 'nam',
    listPrice: 559000,
    colors: ['den', 'xam'],
    sizes: ['29', '30', '31', '32'],
    material: 'Vải tuýt',
  },
  {
    slug: 'ao-so-mi-co-tim',
    name: 'Áo sơ mi cổ tim',
    categorySlug: 'ao-so-mi',
    brandSlug: 'moc',
    skuPrefix: 'SEED-020',
    audience: 'nu',
    listPrice: 459000,
    colors: ['be', 'xanh-navy'],
    sizes: ['S', 'M', 'L'],
    material: 'Viscose',
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

export async function seedTestCatalogProducts(prisma: PrismaClient): Promise<void> {
  for (const p of PRODUCTS) {
    const data = {
      name: p.name,
      description: `${p.name}. Du lieu gia de thu giao dien, thay bang du lieu that khi nap tu HT-03.`,
      material: p.material,
      careInstructions: 'Giặt máy ở 30 độ, không dùng chất tẩy.',
      priceFrom: priceFromOf(p),
      isActive: true,
      isFeatured: p.isFeatured ?? false,
      audience: p.audience,
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
}
