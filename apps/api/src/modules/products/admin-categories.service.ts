import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  computeHierarchyVisibility,
  lockCategory,
  toIsoString,
  updateCategoryVisibilityMonotonic,
} from './category-visibility.js';
import {
  AdminCategoryChildSummary,
  AdminCategoryDetail,
  AdminCategoryNode,
} from './dto/admin-category.response.js';
import {
  AdminCategoryVisibilityResponse,
  ChangeCategoryVisibilityDto,
} from './dto/change-category-visibility.dto.js';

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đọc cây danh mục quản trị:
   * - Bao gồm toàn bộ danh mục đang hiện và đang ẩn
   * - Giữ nguyên thứ tự sắp xếp và phân cấp cha–con
   * - Đếm sản phẩm trực tiếp và sản phẩm toàn nhánh trong cùng một snapshot RepeatableRead
   */
  async tree(): Promise<AdminCategoryNode[]> {
    return this.prisma.$transaction(
      async (tx) => {
        const allCategories = await tx.category.findMany({
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
            sortOrder: true,
            isActive: true,
            updatedAt: true,
          },
        });

        // Đếm tổng sản phẩm trực tiếp (kể cả sản phẩm đang ẩn) theo từng danh mục
        const directCounts = await tx.product.groupBy({
          by: ['categoryId'],
          _count: { _all: true },
        });
        const directCountMap = new Map(directCounts.map((g) => [g.categoryId, g._count._all]));

        const roots = allCategories.filter((c) => c.parentId === null);
        const childrenByParent = new Map<string, typeof allCategories>();
        for (const c of allCategories) {
          if (c.parentId) {
            const list = childrenByParent.get(c.parentId) ?? [];
            list.push(c);
            childrenByParent.set(c.parentId, list);
          }
        }

        return roots.map((root) => {
          const rawChildren = childrenByParent.get(root.id) ?? [];
          const rootDirectCount = directCountMap.get(root.id) ?? 0;

          const children: AdminCategoryNode[] = rawChildren.map((child) => {
            const childDirectCount = directCountMap.get(child.id) ?? 0;
            return {
              id: child.id,
              name: child.name,
              slug: child.slug,
              parentId: child.parentId,
              sortOrder: child.sortOrder,
              isActive: child.isActive,
              effectiveActive: root.isActive && child.isActive,
              parentHidden: !root.isActive,
              productCount: childDirectCount,
              subtreeProductCount: childDirectCount,
              updatedAt: toIsoString(child.updatedAt),
              children: [],
            };
          });

          const subtreeProductCount =
            rootDirectCount + children.reduce((sum, child) => sum + child.subtreeProductCount, 0);

          return {
            id: root.id,
            name: root.name,
            slug: root.slug,
            parentId: null,
            sortOrder: root.sortOrder,
            isActive: root.isActive,
            effectiveActive: root.isActive,
            parentHidden: false,
            productCount: rootDirectCount,
            subtreeProductCount,
            updatedAt: toIsoString(root.updatedAt),
            children,
          };
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Xem chi tiết danh mục theo UUID trong cùng một snapshot RepeatableRead
   */
  async findById(id: string): Promise<AdminCategoryDetail> {
    return this.prisma.$transaction(
      async (tx) => {
        const category = await tx.category.findUnique({
          where: { id },
          include: {
            parent: {
              select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
                updatedAt: true,
              },
            },
            children: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                slug: true,
                sortOrder: true,
                isActive: true,
                updatedAt: true,
              },
            },
          },
        });
        if (!category) throw new NotFoundException('Không tìm thấy danh mục');

        const childIds = category.children.map((c) => c.id);
        const allIds = [category.id, ...childIds];
        const directCounts = await tx.product.groupBy({
          by: ['categoryId'],
          where: { categoryId: { in: allIds } },
          _count: { _all: true },
        });
        const directCountMap = new Map(directCounts.map((g) => [g.categoryId, g._count._all]));

        const productCount = directCountMap.get(category.id) ?? 0;
        const childrenWithCounts: AdminCategoryChildSummary[] = category.children.map((c) => {
          const cCount = directCountMap.get(c.id) ?? 0;
          return {
            id: c.id,
            name: c.name,
            slug: c.slug,
            sortOrder: c.sortOrder,
            isActive: c.isActive,
            effectiveActive: category.isActive && c.isActive,
            parentHidden: !category.isActive,
            productCount: cCount,
            subtreeProductCount: cCount,
            updatedAt: toIsoString(c.updatedAt),
          };
        });

        const subtreeProductCount =
          productCount + childrenWithCounts.reduce((acc, c) => acc + c.subtreeProductCount, 0);

        const { effectiveActive, parentHidden } = computeHierarchyVisibility(
          category,
          category.parent,
        );

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
          effectiveActive,
          parentHidden,
          productCount,
          subtreeProductCount,
          updatedAt: toIsoString(category.updatedAt),
          parent: category.parent
            ? {
                id: category.parent.id,
                name: category.parent.name,
                slug: category.parent.slug,
                isActive: category.parent.isActive,
                effectiveActive: category.parent.isActive,
              }
            : null,
          children: childrenWithCounts,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * Thay đổi trạng thái hiển thị (isActive) an toàn với CAS:
   * 1. Khóa hàng FOR UPDATE
   * 2. Kiểm tra token CAS trước no-op (token lệch lập tức trả 409 kể cả khi isActive trùng nhau)
   * 3. No-op: nếu CAS khớp và isActive không đổi -> trả về hiện tại, không UPDATE, không bump revision
   * 4. Cập nhật đơn điệu: updated_at = GREATEST(NOW(), updated_at + 1ms) với WHERE id = $1 AND updated_at = token
   */
  async changeVisibility(
    id: string,
    input: ChangeCategoryVisibilityDto,
  ): Promise<AdminCategoryVisibilityResponse> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockCategory(tx, id);
      if (!before) throw new NotFoundException('Không tìm thấy danh mục');

      const currentIso = toIsoString(before.updatedAt);

      // CAS check BẮT BUỘC thực hiện trước no-op check
      if (currentIso !== input.expectedUpdatedAt) {
        throw new ConflictException(
          'Danh mục đã được thay đổi trên máy chủ. Tải lại và xác nhận lại.',
        );
      }

      const parent = before.parentId
        ? await tx.category.findUnique({
            where: { id: before.parentId },
            select: { id: true, isActive: true },
          })
        : null;

      // No-op: CAS hợp lệ và mục tiêu trùng hiện tại -> không ghi DB, không tăng revision
      if (before.isActive === input.isActive) {
        const { effectiveActive, parentHidden } = computeHierarchyVisibility(before, parent);
        return {
          id: before.id,
          name: before.name,
          slug: before.slug,
          isActive: before.isActive,
          effectiveActive,
          parentHidden,
          updatedAt: currentIso,
        };
      }

      // Trạng thái thay đổi thực sự: thực hiện câu lệnh UPDATE tăng đơn điệu
      const updated = await updateCategoryVisibilityMonotonic(tx, id, input.isActive, currentIso);
      if (!updated) {
        throw new ConflictException(
          'Danh mục đã được thay đổi trên máy chủ. Tải lại và xác nhận lại.',
        );
      }

      const { effectiveActive, parentHidden } = computeHierarchyVisibility(updated, parent);
      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        isActive: updated.isActive,
        effectiveActive,
        parentHidden,
        updatedAt: toIsoString(updated.updatedAt),
      };
    });
  }
}
