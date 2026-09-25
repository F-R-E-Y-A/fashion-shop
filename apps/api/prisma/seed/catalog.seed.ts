/**
 * Final HT-02 catalog seed. Business keys keep repeated runs idempotent:
 * category/product slugs and ProductVariant SKU.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

export const CATEGORIES = [
  { name: 'Ao', slug: 'ao' },
  { name: 'Quan', slug: 'quan' },
  { name: 'Phu kien', slug: 'phu-kien' },
] as const;

export const PRODUCTS = [
  {
    name: 'Ao thun co tron basic',
    slug: 'ao-thun-co-tron-basic',
    price: 199000,
    categorySlug: 'ao',
    sku: 'SEED-001',
  },
  {
    name: 'Ao so mi linen tay dai',
    slug: 'ao-so-mi-linen-tay-dai',
    price: 459000,
    categorySlug: 'ao',
    sku: 'SEED-002',
  },
  {
    name: 'Ao khoac du hai lop',
    slug: 'ao-khoac-du-hai-lop',
    price: 689000,
    categorySlug: 'ao',
    sku: 'SEED-003',
  },
  {
    name: 'Ao polo cotton pique',
    slug: 'ao-polo-cotton-pique',
    price: 329000,
    categorySlug: 'ao',
    sku: 'SEED-004',
  },
  {
    name: 'Quan jean ong suong',
    slug: 'quan-jean-ong-suong',
    price: 549000,
    categorySlug: 'quan',
    sku: 'SEED-005',
  },
  {
    name: 'Quan kaki tui hop',
    slug: 'quan-kaki-tui-hop',
    price: 429000,
    categorySlug: 'quan',
    sku: 'SEED-006',
  },
  {
    name: 'Quan short the thao',
    slug: 'quan-short-the-thao',
    price: 259000,
    categorySlug: 'quan',
    sku: 'SEED-007',
  },
  {
    name: 'Quan tay cong so',
    slug: 'quan-tay-cong-so',
    price: 479000,
    categorySlug: 'quan',
    sku: 'SEED-008',
  },
  {
    name: 'Mu luoi trai canvas',
    slug: 'mu-luoi-trai-canvas',
    price: 149000,
    categorySlug: 'phu-kien',
    sku: 'SEED-009',
  },
  {
    name: 'That lung da bo',
    slug: 'that-lung-da-bo',
    price: 359000,
    categorySlug: 'phu-kien',
    sku: 'SEED-010',
  },
] as const;

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<{ categories: number; products: number; productVariants: number }> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
  }

  for (const productSeed of PRODUCTS) {
    const description = `${productSeed.name}. Du lieu gia dung de thu giao dien, se thay bang du lieu that o tuan 2.`;
    const product = await prisma.product.upsert({
      where: { slug: productSeed.slug },
      update: {
        name: productSeed.name,
        description,
        isActive: true,
        category: { connect: { slug: productSeed.categorySlug } },
      },
      create: {
        name: productSeed.name,
        slug: productSeed.slug,
        description,
        isActive: true,
        category: { connect: { slug: productSeed.categorySlug } },
      },
    });

    await prisma.productVariant.upsert({
      where: { sku: productSeed.sku },
      update: {
        product: { connect: { id: product.id } },
        price: productSeed.price,
        size: null,
        color: null,
        isActive: true,
      },
      create: {
        product: { connect: { id: product.id } },
        sku: productSeed.sku,
        price: productSeed.price,
        size: null,
        color: null,
        isActive: true,
      },
    });
  }

  const [categories, products, productVariants] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);
  return { categories, products, productVariants };
}
