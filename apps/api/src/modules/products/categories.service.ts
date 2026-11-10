import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CategoryDetailResponse, CategoryNodeResponse } from './dto/category.response.js';
import { storefrontProductWhere } from './storefront.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(): Promise<CategoryNodeResponse[]> {
    // So san pham hien thi duoc theo tung danh muc, dem mot lan bang mot cau truy van.
    const grouped = await this.prisma.product.groupBy({
      by: ['categoryId'],
      where: storefrontProductWhere(),
      _count: { _all: true },
    });
    const countOf = new Map(grouped.map((g) => [g.categoryId, g._count._all]));
    const roots = await this.prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    return roots.map((root) => {
      const children = root.children.map((child) => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        productCount: countOf.get(child.id) ?? 0,
        children: [],
      }));
      return {
        id: root.id,
        name: root.name,
        slug: root.slug,
        // Danh muc cha tinh ca san pham cua cac danh muc con.
        productCount:
          (countOf.get(root.id) ?? 0) +
          children.reduce((sum, child) => sum + child.productCount, 0),
        children,
      };
    });
  }

  async findBySlug(slug: string): Promise<CategoryDetailResponse> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!category || !category.isActive || (category.parent && !category.parent.isActive)) {
      throw new NotFoundException(`Không tìm thấy danh mục: ${slug}`);
    }
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      breadcrumb: [
        ...(category.parent ? [{ name: category.parent.name, slug: category.parent.slug }] : []),
        { name: category.name, slug: category.slug },
      ],
      children: category.children.map((child) => ({ name: child.name, slug: child.slug })),
    };
  }
}
