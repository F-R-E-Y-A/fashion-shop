import { Injectable, NotFoundException } from '@nestjs/common';

import { skipOf, toPage } from '../../common/pagination/page.response.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';

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

/**
 * Tang nghiep vu. Controller khong duoc goi thang Prisma, phai di qua day (ESLint chan).
 * Ly do: khi mot phan he khac can doc san pham, no tiem service nay qua index.js,
 * chu khong tu viet cau truy van vao bang cua nguoi khac.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

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
