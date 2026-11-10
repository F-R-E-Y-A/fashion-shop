import { Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InventoryService } from '../inventory/index.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';
import { ProductDetailResponse } from './dto/product-detail.response.js';
import type { ImportProductRow, ImportRowResult } from './import/import.types.js';
import { ImportRowError } from './import/import-row.error.js';
import { sourceSlug } from './import/slug.js';
import { validateRow } from './import/validate-row.js';
import { lockProductStatus, productStatusChange } from './product-status.js';
import { audienceFrom } from './search/audience.js';
import { withProductStock } from './stock.js';
import {
  storefrontProductInclude,
  storefrontProductWhere,
  toProductResponse,
  visibleCategory,
} from './storefront.js';

const detailProductInclude = {
  category: { include: { parent: true } },
  brand: { select: { name: true } },
  images: { orderBy: { sortOrder: 'asc' }, include: { color: true } },
  variants: { where: { isActive: true }, include: { color: true, size: true } },
} as const;

const cartVariantInclude = {
  color: true,
  size: true,
  product: {
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { sortOrder: 'asc' } },
    },
  },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

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
    // Khoa truoc metadata/variants/images, cung thu tu voi admin. Doc hold sau khoa,
    // khong dung snapshot tu luc tim SKU de tranh import mo lai san pham vua ngung ban.
    const status = existingProductId ? await lockProductStatus(tx, existingProductId) : undefined;
    if (existingProductId && !status) throw new Error('Sản phẩm biến mất trong lúc import');

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
        row.attributes === undefined ? Prisma.DbNull : (row.attributes as Prisma.InputJsonObject),
      priceFrom,
      // Suy tu slug danh muc nguon luc nap; nap lai thi cap nhat theo nguon (3.2b, ADR-019).
      audience: audienceFrom(row.attributes, row.name),
    };
    const product = existingProductId
      ? await tx.product.update({
          where: { id: existingProductId },
          data: {
            ...productData,
            ...productStatusChange(status!, status!.adminDisabled, row.images.length > 0),
          },
        })
      : await tx.product.create({
          data: {
            ...productData,
            isActive: row.images.length > 0,
            slug: sourceSlug(row.name, row.sourceKey),
          },
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

    const where: Prisma.ProductWhereInput = storefrontProductWhere({
      category: categorySlug
        ? {
            AND: [
              visibleCategory,
              { OR: [{ slug: categorySlug }, { parent: { slug: categorySlug } }] },
            ],
          }
        : visibleCategory,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(query.featured ? { isFeatured: true } : {}),
    });
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'price_asc'
        ? [{ priceFrom: 'asc' }, { id: 'asc' }]
        : query.sort === 'price_desc'
          ? [{ priceFrom: 'desc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }];

    // Dem va lay du lieu trong cung mot giao dich de hai con so luon khop nhau.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: storefrontProductInclude,
        orderBy,
        skip: skipOf(query),
        take: query.pageSize,
      }),
    ]);

    return toPage(
      await withProductStock(
        rows.map((row) => toProductResponse(row)),
        rows,
        this.inventory,
      ),
      total,
      query,
    );
  }

  async findBySlug(slug: string): Promise<ProductDetailResponse> {
    const row = await this.prisma.product.findFirst({
      where: storefrontProductWhere({ slug }),
      include: detailProductInclude,
    });
    if (!row) throw new NotFoundException(`Không tìm thấy sản phẩm: ${slug}`);

    const variants = [...row.variants].sort(
      (a, b) => a.size.sortOrder - b.size.sortOrder || a.color.code.localeCompare(b.color.code),
    );
    const colors = [
      ...new Map(
        variants.map((variant) => [
          variant.color.code,
          { code: variant.color.code, name: variant.color.name, hex: variant.color.hex },
        ]),
      ).values(),
    ];
    const quantities = await this.inventory.getAvailableQuantities(
      variants.map((variant) => variant.id),
    );
    const [summary] = await withProductStock([toProductResponse(row)], [row], this.inventory);
    return {
      ...summary,
      material: row.material,
      careInstructions: row.careInstructions,
      breadcrumb: [
        ...(row.category.parent
          ? [{ name: row.category.parent.name, slug: row.category.parent.slug }]
          : []),
        { name: row.category.name, slug: row.category.slug },
      ],
      colors,
      images: row.images.map((image) => ({
        url: image.url,
        alt: image.alt,
        colorCode: image.color?.code ?? null,
      })),
      variants: variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        colorCode: variant.color.code,
        sizeCode: variant.size.code,
        price: (variant.salePrice ?? variant.listPrice).toString(),
        listPrice: variant.salePrice ? variant.listPrice.toString() : null,
        availableQuantity: quantities.get(variant.id) ?? null,
      })),
    };
  }

  async related(slug: string, limit: number): Promise<ProductResponse[]> {
    const current = await this.prisma.product.findFirst({
      where: {
        slug,
        isActive: true,
        category: visibleCategory,
        variants: { some: { isActive: true } },
      },
      select: { id: true, categoryId: true },
    });
    if (!current) throw new NotFoundException(`Không tìm thấy sản phẩm: ${slug}`);
    const rows = await this.prisma.product.findMany({
      where: storefrontProductWhere({ id: { not: current.id }, categoryId: current.categoryId }),
      include: storefrontProductInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return withProductStock(
      rows.map((product) => toProductResponse(product)),
      rows,
      this.inventory,
    );
  }

  async getVariantForCart(
    variantId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<VariantForCart | null> {
    return (await this.getVariantsForCart([variantId], transaction))[0] ?? null;
  }

  async getVariantsForCart(
    variantIds: string[],
    transaction?: Prisma.TransactionClient,
  ): Promise<VariantForCart[]> {
    if (variantIds.length === 0) return [];

    const variants = await (transaction ?? this.prisma).productVariant.findMany({
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

    const category = variant.product.category;
    const isCategoryActive = category.isActive && (!category.parent || category.parent.isActive);

    return {
      variantId: variant.id,
      productId: variant.productId,
      productSlug: variant.product.slug,
      name: variant.product.name,
      variantLabel: labelParts.join(' / '),
      price: (variant.salePrice ?? variant.listPrice).toString(),
      imageUrl: image?.url ?? null,
      isActive: variant.isActive && variant.product.isActive && isCategoryActive,
    };
  }
}
