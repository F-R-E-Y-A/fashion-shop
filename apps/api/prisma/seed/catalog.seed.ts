/**
 * Du lieu gia cua phan he danh muc va san pham (Bao, PH-01).
 * Ma dinh danh CO DINH de ba nguoi, CI va bai kiem thu deu thay cung mot bo du lieu.
 * Bai kiem thu import cac hang so o day thay vi go lai so, de doi du lieu mot cho la du.
 */
import type { PrismaClient } from '../../src/generated/prisma/client.js';

export const CATEGORY_IDS = {
  ao: '11111111-1111-4111-8111-000000000001',
  quan: '11111111-1111-4111-8111-000000000002',
  phuKien: '11111111-1111-4111-8111-000000000003',
} as const;

export const CATEGORIES = [
  { id: CATEGORY_IDS.ao, name: 'Ao', slug: 'ao' },
  { id: CATEGORY_IDS.quan, name: 'Quan', slug: 'quan' },
  { id: CATEGORY_IDS.phuKien, name: 'Phu kien', slug: 'phu-kien' },
] as const;

const P = (n: number): string => `22222222-2222-4222-8222-0000000000${String(n).padStart(2, '0')}`;

export const PRODUCTS = [
  {
    id: P(1),
    name: 'Ao thun co tron basic',
    slug: 'ao-thun-co-tron-basic',
    price: 199000,
    categoryId: CATEGORY_IDS.ao,
  },
  {
    id: P(2),
    name: 'Ao so mi linen tay dai',
    slug: 'ao-so-mi-linen-tay-dai',
    price: 459000,
    categoryId: CATEGORY_IDS.ao,
  },
  {
    id: P(3),
    name: 'Ao khoac du hai lop',
    slug: 'ao-khoac-du-hai-lop',
    price: 689000,
    categoryId: CATEGORY_IDS.ao,
  },
  {
    id: P(4),
    name: 'Ao polo cotton pique',
    slug: 'ao-polo-cotton-pique',
    price: 329000,
    categoryId: CATEGORY_IDS.ao,
  },
  {
    id: P(5),
    name: 'Quan jean ong suong',
    slug: 'quan-jean-ong-suong',
    price: 549000,
    categoryId: CATEGORY_IDS.quan,
  },
  {
    id: P(6),
    name: 'Quan kaki tui hop',
    slug: 'quan-kaki-tui-hop',
    price: 429000,
    categoryId: CATEGORY_IDS.quan,
  },
  {
    id: P(7),
    name: 'Quan short the thao',
    slug: 'quan-short-the-thao',
    price: 259000,
    categoryId: CATEGORY_IDS.quan,
  },
  {
    id: P(8),
    name: 'Quan tay cong so',
    slug: 'quan-tay-cong-so',
    price: 479000,
    categoryId: CATEGORY_IDS.quan,
  },
  {
    id: P(9),
    name: 'Mu luoi trai canvas',
    slug: 'mu-luoi-trai-canvas',
    price: 149000,
    categoryId: CATEGORY_IDS.phuKien,
  },
  {
    id: P(10),
    name: 'That lung da bo',
    slug: 'that-lung-da-bo',
    price: 359000,
    categoryId: CATEGORY_IDS.phuKien,
  },
] as const;

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<{ categories: number; products: number }> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, slug: category.slug },
      create: { id: category.id, name: category.name, slug: category.slug },
    });
  }

  for (const product of PRODUCTS) {
    const data = {
      name: product.name,
      slug: product.slug,
      description: `${product.name}. Du lieu gia de thu giao dien, thay bang du lieu that o tuan 2.`,
      price: product.price,
      imageUrl: null,
      isActive: true,
      categoryId: product.categoryId,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      update: data,
      create: { id: product.id, ...data },
    });
  }

  const [categories, products] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
  ]);
  return { categories, products };
}
