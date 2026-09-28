/**
 * Nap danh muc va bang tra cuu dung cho du lieu crawl that (ADR-007, docs/features/products/erd.md).
 * San pham mau chi duoc tao trong test fixtures, khong duoc nap vao storefront dev.
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

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<{ categories: number; brands: number; colors: number; sizes: number }> {
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

  return {
    categories: CATEGORIES.length,
    brands: BRANDS.length,
    colors: COLORS.length,
    sizes: SIZES.length,
  };
}
