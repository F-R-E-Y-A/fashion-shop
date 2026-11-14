import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  ADMIN_MANAGED_CATEGORY_FIELDS,
  CategoryLockSetChangedError,
  computeHierarchyVisibility,
  isUniqueViolationError,
  lockCategoriesOrdered,
  lockCategory,
  runCategoryTxWithRetry,
  slugifyCategoryName,
  toIsoString,
  updateCategoryFieldsMonotonic,
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
import { CATEGORY_SLUG_REGEX, CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

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
    return this.prisma.$transaction((tx) => this.buildDetailInTx(tx, id), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async buildDetailInTx(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<AdminCategoryDetail> {
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

    const { effectiveActive, parentHidden } = computeHierarchyVisibility(category, category.parent);

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
  }

  /**
   * Tạo danh mục mới (mặc định ẩn isActive = false), idempotent theo UUID v4 do client sinh.
   */
  async create(input: CreateCategoryDto): Promise<AdminCategoryDetail> {
    if (input.name === null || typeof input.name !== 'string') {
      throw new BadRequestException('name không hợp lệ');
    }
    if (input.slug !== undefined && (input.slug === null || typeof input.slug !== 'string')) {
      throw new BadRequestException('slug không hợp lệ');
    }
    if (
      input.sortOrder !== undefined &&
      (input.sortOrder === null || typeof input.sortOrder !== 'number')
    ) {
      throw new BadRequestException('sortOrder không hợp lệ');
    }

    const normalizedName = input.name.trim();
    const normalizedSlug = input.slug ?? slugifyCategoryName(normalizedName);
    if (
      normalizedSlug.length < 2 ||
      normalizedSlug.length > 120 ||
      !CATEGORY_SLUG_REGEX.test(normalizedSlug)
    ) {
      throw new BadRequestException(
        'Không thể sinh slug hợp lệ từ tên danh mục; vui lòng nhập slug rõ ràng.',
      );
    }
    const normalizedParentId = input.parentId ?? null;
    const normalizedSortOrder = input.sortOrder ?? 0;

    try {
      return await runCategoryTxWithRetry(this.prisma, async (tx) => {
        const lockedRows = await lockCategoriesOrdered(tx, [input.id, normalizedParentId]);
        const lockedMap = new Map(lockedRows.map((row) => [row.id, row]));

        const existingById = lockedMap.get(input.id);
        if (existingById) {
          const samePayload =
            existingById.name === normalizedName &&
            existingById.slug === normalizedSlug &&
            existingById.parentId === normalizedParentId &&
            existingById.sortOrder === normalizedSortOrder;
          if (!samePayload) {
            throw new ConflictException('Mã danh mục (UUID) đã tồn tại với nội dung khác.');
          }
          return this.buildDetailInTx(tx, input.id);
        }

        if (normalizedParentId) {
          const parent = lockedMap.get(normalizedParentId);
          if (!parent) {
            throw new NotFoundException('Không tìm thấy danh mục cha.');
          }
          if (parent.parentId !== null) {
            throw new UnprocessableEntityException(
              'Không thể gắn danh mục cha là danh mục cấp 2 (cây tối đa hai cấp).',
            );
          }
          const parentDirectProducts = await tx.product.count({
            where: { categoryId: normalizedParentId },
          });
          if (parentDirectProducts > 0) {
            throw new UnprocessableEntityException(
              'Không thể thêm danh mục con vào danh mục đang có sản phẩm trực tiếp.',
            );
          }
        }

        const existingBySlug = await tx.category.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        });
        if (existingBySlug && existingBySlug.id !== input.id) {
          throw new ConflictException('Slug danh mục đã tồn tại.');
        }

        await tx.category.create({
          data: {
            id: input.id,
            name: normalizedName,
            slug: normalizedSlug,
            parentId: normalizedParentId,
            sortOrder: normalizedSortOrder,
            isActive: false,
            adminManagedFields: [...ADMIN_MANAGED_CATEGORY_FIELDS],
          },
        });

        return this.buildDetailInTx(tx, input.id);
      });
    } catch (error) {
      if (isUniqueViolationError(error)) {
        const existingById = await this.prisma.category.findUnique({
          where: { id: input.id },
        });
        if (existingById) {
          const samePayload =
            existingById.name === normalizedName &&
            existingById.slug === normalizedSlug &&
            existingById.parentId === normalizedParentId &&
            existingById.sortOrder === normalizedSortOrder;
          if (!samePayload) {
            throw new ConflictException('Mã danh mục (UUID) đã tồn tại với nội dung khác.');
          }
          return this.findById(input.id);
        }
        const existingBySlug = await this.prisma.category.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        });
        if (existingBySlug) {
          throw new ConflictException('Slug danh mục đã tồn tại.');
        }
      }
      throw error;
    }
  }

  /**
   * Cập nhật tên, thứ tự, danh mục cha với CAS, khóa ordered UUID và bảo vệ adminManagedFields.
   */
  async update(id: string, input: UpdateCategoryDto): Promise<AdminCategoryDetail> {
    if (input.name === undefined && input.parentId === undefined && input.sortOrder === undefined) {
      throw new BadRequestException('Phải cung cấp ít nhất một trường cần cập nhật.');
    }

    return runCategoryTxWithRetry(this.prisma, async (tx) => {
      const hint = await tx.category.findUnique({
        where: { id },
        select: { parentId: true },
      });

      const lockedRows = await lockCategoriesOrdered(tx, [id, hint?.parentId, input.parentId]);
      const lockedMap = new Map(lockedRows.map((row) => [row.id, row]));

      const before = lockedMap.get(id);
      if (!before) {
        throw new NotFoundException('Không tìm thấy danh mục');
      }

      // Xác minh sau khi chờ khóa tập node/cha còn đầy đủ trong lock set; nếu đã đổi cha thì khởi động lại tx
      if (before.parentId !== null && !lockedMap.has(before.parentId)) {
        throw new CategoryLockSetChangedError();
      }

      const currentIso = toIsoString(before.updatedAt);
      if (currentIso !== input.expectedUpdatedAt) {
        throw new ConflictException(
          'Danh mục đã được thay đổi trên máy chủ. Tải lại và xác nhận lại.',
        );
      }

      if (input.name !== undefined && (input.name === null || typeof input.name !== 'string')) {
        throw new BadRequestException('name không hợp lệ');
      }
      if (
        input.sortOrder !== undefined &&
        (input.sortOrder === null || typeof input.sortOrder !== 'number')
      ) {
        throw new BadRequestException('sortOrder không hợp lệ');
      }

      const nextName = input.name !== undefined ? input.name.trim() : before.name;
      const nextParentId = input.parentId !== undefined ? input.parentId : before.parentId;
      const nextSortOrder = input.sortOrder !== undefined ? input.sortOrder : before.sortOrder;

      const changedFields: string[] = [];
      if (nextName !== before.name) changedFields.push('name');
      if (nextParentId !== before.parentId) changedFields.push('parentId');
      if (nextSortOrder !== before.sortOrder) changedFields.push('sortOrder');

      // No-op: CAS hợp lệ và không trường nào thay đổi -> không UPDATE, không tăng updatedAt, không thêm adminManagedFields
      if (changedFields.length === 0) {
        return this.buildDetailInTx(tx, id);
      }

      if (nextParentId === id) {
        throw new UnprocessableEntityException(
          'Danh mục không thể tự làm danh mục cha của chính nó.',
        );
      }

      if (nextParentId !== before.parentId && nextParentId !== null) {
        const childCount = await tx.category.count({ where: { parentId: id } });
        if (childCount > 0) {
          throw new UnprocessableEntityException(
            'Danh mục đang có danh mục con, không thể chuyển thành danh mục cấp 2.',
          );
        }

        const targetParent = lockedMap.get(nextParentId);
        if (!targetParent) {
          throw new NotFoundException('Không tìm thấy danh mục cha.');
        }
        if (targetParent.parentId !== null) {
          throw new UnprocessableEntityException(
            'Không thể chuyển vào danh mục cấp 2 (cây tối đa hai cấp).',
          );
        }

        const parentDirectProducts = await tx.product.count({
          where: { categoryId: nextParentId },
        });
        if (parentDirectProducts > 0) {
          throw new UnprocessableEntityException(
            'Không thể chuyển vào danh mục đang có sản phẩm trực tiếp.',
          );
        }
      }

      const nextManagedFields = ADMIN_MANAGED_CATEGORY_FIELDS.filter(
        (field) => before.adminManagedFields.includes(field) || changedFields.includes(field),
      );

      const updated = await updateCategoryFieldsMonotonic(
        tx,
        id,
        {
          name: nextName,
          parentId: nextParentId,
          sortOrder: nextSortOrder,
          adminManagedFields: nextManagedFields,
        },
        currentIso,
      );
      if (!updated) {
        throw new ConflictException(
          'Danh mục đã được thay đổi trên máy chủ. Tải lại và xác nhận lại.',
        );
      }

      return this.buildDetailInTx(tx, id);
    });
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
    return runCategoryTxWithRetry(this.prisma, async (tx) => {
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
