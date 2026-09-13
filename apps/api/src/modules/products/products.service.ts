import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductListResponse, ProductResponse } from './dto/product.response.js';

/**
 * Tang nghiep vu. Controller khong duoc goi thang Prisma, phai di qua day.
 * Ly do: khi mot phan he khac can doc san pham, no goi service nay,
 * chu khong tu viet cau truy van vao bang cua nguoi khac.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQuery): Promise<ProductListResponse> {
    const { page, pageSize, search, categorySlug } = query;

    const where = {
      isActive: true,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    };

    // Dem va lay du lieu trong cung mot giao dich de hai con so luon khop nhau.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((row) => this.toResponse(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findBySlug(slug: string): Promise<ProductResponse> {
    const row = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: { category: true },
    });

    if (!row) {
      throw new NotFoundException(`Khong tim thay san pham co duong dan "${slug}"`);
    }

    return this.toResponse(row);
  }

  private toResponse(row: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: unknown;
    imageUrl: string | null;
    category: { name: string; slug: string };
  }): ProductResponse {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      price: String(row.price),
      imageUrl: row.imageUrl,
      categoryName: row.category.name,
      categorySlug: row.category.slug,
    };
  }
}
