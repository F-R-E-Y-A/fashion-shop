/**
 * Bo du lieu gia dung chung.
 *
 * Ma dinh danh deu CO DINH, khong sinh ngau nhien. Ly do: ba nguoi va may chay
 * tich hop lien tuc deu phai thay cung mot bo du lieu, nho vay bai kiem thu
 * moi viet duoc cau lenh kieu "mo san pham co ma 1111..." ma khong vo khi chay lai.
 *
 * Chay lai duoc nhieu lan nho upsert, khong sinh ban ghi trung.
 */
import { config as loadEnv } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Thieu DATABASE_URL. Chep .env.example thanh .env o goc kho ma.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const CATEGORIES = [
  { id: '11111111-1111-4111-8111-000000000001', name: 'Ao', slug: 'ao' },
  { id: '11111111-1111-4111-8111-000000000002', name: 'Quan', slug: 'quan' },
  { id: '11111111-1111-4111-8111-000000000003', name: 'Phu kien', slug: 'phu-kien' },
];

const PRODUCTS = [
  ['22222222-2222-4222-8222-000000000001', 'Ao thun co tron basic', 'ao-thun-co-tron-basic', 199000, 1],
  ['22222222-2222-4222-8222-000000000002', 'Ao so mi linen tay dai', 'ao-so-mi-linen-tay-dai', 459000, 1],
  ['22222222-2222-4222-8222-000000000003', 'Ao khoac du hai lop', 'ao-khoac-du-hai-lop', 689000, 1],
  ['22222222-2222-4222-8222-000000000004', 'Ao polo cotton pique', 'ao-polo-cotton-pique', 329000, 1],
  ['22222222-2222-4222-8222-000000000005', 'Quan jean ong suong', 'quan-jean-ong-suong', 549000, 2],
  ['22222222-2222-4222-8222-000000000006', 'Quan kaki tui hop', 'quan-kaki-tui-hop', 429000, 2],
  ['22222222-2222-4222-8222-000000000007', 'Quan short the thao', 'quan-short-the-thao', 259000, 2],
  ['22222222-2222-4222-8222-000000000008', 'Quan tay cong so', 'quan-tay-cong-so', 479000, 2],
  ['22222222-2222-4222-8222-000000000009', 'Mu luoi trai canvas', 'mu-luoi-trai-canvas', 149000, 3],
  ['22222222-2222-4222-8222-000000000010', 'That lung da bo', 'that-lung-da-bo', 359000, 3],
] as const;

async function main(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { name: category.name, slug: category.slug },
      create: category,
    });
  }

  for (const [id, name, slug, price, categoryIndex] of PRODUCTS) {
    const data = {
      name,
      slug,
      description: `${name}. Du lieu gia dung de thu giao dien, se thay bang du lieu that o tuan 2.`,
      price,
      imageUrl: null,
      isActive: true,
      categoryId: CATEGORIES[categoryIndex - 1].id,
    };

    await prisma.product.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  const [categories, products] = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
  ]);
  console.log(`Da nap du lieu gia: ${categories} danh muc, ${products} san pham.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
