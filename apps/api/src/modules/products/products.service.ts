import { Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';
import type { ImportProductRow, ImportRowResult } from './import/import.types.js';
import { ImportRowError } from './import/import-row.error.js';
import { sourceSlug } from './import/slug.js';
import { validateRow } from './import/validate-row.js';

// Gia lay tu products.price_from (gia ban thap nhat, service tinh lai khi ghi bien the, ADR-007),
// nen khong can truy van phu tim bien the re nhat cho moi dong.
const storefrontProductInclude = {
  category: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    take: 1,
    select: { url: true },
  },
} as const;

const cartVariantInclude = {
  color: true,
  size: true,
  product: { include: { images: { orderBy: { sortOrder: 'asc' } } } },
} as const;

type CartVariant = Prisma.ProductVariantGetPayload<{ include: typeof cartVariantInclude }>;

export interface VariantForCart {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  variantLabel: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
}

type ImportSuccess = Extract<ImportRowResult, { status: 'created' | 'updated' }>;

/**
 * Tang nghiep vu. Controller khong duoc goi thang Prisma, phai di qua day (ESLint chan).
 * Ly do: khi mot phan he khac can doc san pham, no tiem service nay qua index.js,
 * chu khong tu viet cau truy van vao bang cua nguoi khac.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async importProducts(rows: ImportProductRow[]): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];
    for (const row of rows) {
      try {
        const result = await this.prisma.$transaction((tx) => this.importOne(tx, row));
        results.push(result);
      } catch (error) {
        if (error instanceof ImportRowError) {
          results.push({
            sourceKey: row.sourceKey,
            status: 'failed',
            reason: error.reason,
            detail: error.message,
          });
        } else {
          throw error; // lỗi DB/lập trình: phải lộ ra để sửa, không đổi thành "dòng lỗi"
        }
      }
    }
    return results;
  }

  private async importOne(
    tx: Prisma.TransactionClient,
    row: ImportProductRow,
  ): Promise<ImportSuccess> {
    const invalid = validateRow(row);
    if (invalid) throw invalid;

    const category = await tx.category.findUnique({
      where: { slug: row.categorySlug },
      include: { _count: { select: { children: true } } },
    });
    if (!category || category._count.children > 0) {
      throw new ImportRowError(
        'CATEGORY_NOT_FOUND',
        `Danh mục lá không tồn tại: ${row.categorySlug}`,
      );
    }

    const sizeCodes = [...new Set(row.variants.map((v) => v.sizeCode ?? 'FREE'))];
    const sizes = await tx.size.findMany({
      where: { code: { in: sizeCodes } },
      select: { id: true, code: true },
    });
    const sizeByCode = new Map(sizes.map((size) => [size.code, size.id]));
    for (const code of sizeCodes) {
      if (!sizeByCode.has(code)) {
        throw new ImportRowError('SIZE_NOT_FOUND', `Cỡ không tồn tại: ${code}`);
      }
    }

    const skus = [...new Set(row.variants.map((v) => v.sku))];
    const matches = await tx.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { productId: true },
    });
    const productIds = new Set(matches.map((match) => match.productId));
    if (productIds.size > 1) {
      throw new ImportRowError('SKU_CONFLICT', 'SKU trong dòng thuộc nhiều sản phẩm');
    }
    const existingProductId = [...productIds][0];

    const brand = row.brand
      ? await tx.brand.upsert({
          where: { slug: row.brand.slug },
          create: { slug: row.brand.slug, name: row.brand.name },
          update: {},
        })
      : null;

    const colorByCode = new Map<string, string>();
    for (const variant of row.variants) {
      const code = variant.color?.code ?? 'mac-dinh';
      if (colorByCode.has(code)) continue;
      const color = await tx.color.upsert({
        where: { code },
        create: {
          code,
          name: variant.color?.name ?? 'Mặc định',
          hex: variant.color?.hex ?? null,
        },
        update: {}, // danh sách mở; màu cũ giữ tên và mã hex hiện có
      });
      colorByCode.set(code, color.id);
    }

    const first = row.variants[0];
    if (!first) throw new ImportRowError('NO_VARIANT', 'Sản phẩm phải có ít nhất một biến thể');
    let priceFrom = new Prisma.Decimal(first.salePrice ?? first.listPrice);
    for (const variant of row.variants.slice(1)) {
      const price = new Prisma.Decimal(variant.salePrice ?? variant.listPrice);
      if (price.lt(priceFrom)) priceFrom = price;
    }

    const productData = {
      categoryId: category.id,
      brandId: brand?.id ?? null,
      name: row.name,
      description: row.description ?? null,
      material: row.material ?? null,
      careInstructions: row.careInstructions ?? null,
      attributes:
        row.attributes === undefined ? Prisma.JsonNull : (row.attributes as Prisma.InputJsonObject),
      priceFrom,
    };
    const product = existingProductId
      ? await tx.product.update({ where: { id: existingProductId }, data: productData })
      : await tx.product.create({
          data: { ...productData, slug: sourceSlug(row.name, row.sourceKey) },
        });

    for (const variant of row.variants) {
      const code = variant.color?.code ?? 'mac-dinh';
      const sizeCode = variant.sizeCode ?? 'FREE';
      const colorId = colorByCode.get(code);
      const sizeId = sizeByCode.get(sizeCode);
      if (!colorId || !sizeId) throw new Error('Thiếu màu/cỡ sau khi đã kiểm tra');
      const variantData = {
        productId: product.id,
        colorId,
        sizeId,
        listPrice: new Prisma.Decimal(variant.listPrice),
        salePrice: variant.salePrice === undefined ? null : new Prisma.Decimal(variant.salePrice),
        isActive: true,
      };
      await tx.productVariant.upsert({
        where: { sku: variant.sku },
        create: { sku: variant.sku, ...variantData },
        update: variantData,
      });
    }
    await tx.productVariant.updateMany({
      where: { productId: product.id, sku: { notIn: skus } },
      data: { isActive: false },
    });

    for (const [sortOrder, image] of row.images.entries()) {
      const colorId = image.colorCode ? (colorByCode.get(image.colorCode) ?? null) : null;
      const imageData = { url: image.url, alt: image.alt ?? null, colorId };
      await tx.productImage.upsert({
        where: { productId_sortOrder: { productId: product.id, sortOrder } },
        create: { productId: product.id, sortOrder, ...imageData },
        update: imageData,
      });
    }
    await tx.productImage.deleteMany({
      where: { productId: product.id, sortOrder: { gte: row.images.length } },
    });

    return {
      sourceKey: row.sourceKey,
      status: existingProductId ? 'updated' : 'created',
      productId: product.id,
      slug: product.slug,
    };
  }

  async list(query: ListProductsQuery): Promise<ProductListResponse> {
    const { search, categorySlug } = query;

    const where = {
      isActive: true,
      variants: { some: { isActive: true } },
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    };

    // Dem va lay du lieu trong cung mot giao dich de hai con so luon khop nhau.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: storefrontProductInclude,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.pageSize,
      }),
    ]);

    return toPage(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async findBySlug(slug: string): Promise<ProductResponse> {
    const row = await this.prisma.product.findFirst({
      where: { slug, isActive: true, variants: { some: { isActive: true } } },
      include: storefrontProductInclude,
    });

    if (!row) {
      throw new NotFoundException(`Khong tim thay san pham co duong dan "${slug}"`);
    }

    return this.toResponse(row);
  }

  async getVariantForCart(variantId: string): Promise<VariantForCart | null> {
    return (await this.getVariantsForCart([variantId]))[0] ?? null;
  }

  async getVariantsForCart(variantIds: string[]): Promise<VariantForCart[]> {
    if (variantIds.length === 0) return [];

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: cartVariantInclude,
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    return variantIds.flatMap((id) => {
      const variant = byId.get(id);
      return variant ? [this.toVariantForCart(variant)] : [];
    });
  }

  private toVariantForCart(variant: CartVariant): VariantForCart {
    const images = variant.product.images;
    const image =
      images.find((item) => item.colorId === variant.colorId) ??
      images.find((item) => item.colorId === null) ??
      images[0];
    const labelParts = [
      variant.size.code === 'FREE' ? null : variant.size.code,
      variant.color.code === 'mac-dinh' ? null : variant.color.name,
    ].filter((part): part is string => part !== null);

    return {
      variantId: variant.id,
      productId: variant.productId,
      productSlug: variant.product.slug,
      name: variant.product.name,
      variantLabel: labelParts.join(' / '),
      price: (variant.salePrice ?? variant.listPrice).toString(),
      imageUrl: image?.url ?? null,
      isActive: variant.isActive && variant.product.isActive,
    };
  }

  private toResponse(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    category: { name: string; slug: string };
    priceFrom: { toString(): string };
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
    };
  }
}
