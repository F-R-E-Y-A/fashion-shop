import { classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

export interface AdminCategoryNode {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  effectiveActive: boolean;
  parentHidden: boolean;
  productCount: number;
  subtreeProductCount: number;
  updatedAt: string;
  children: AdminCategoryNode[];
}

export interface AdminCategoryParentSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  effectiveActive: boolean;
}

export interface AdminCategoryChildSummary {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  effectiveActive: boolean;
  parentHidden: boolean;
  productCount: number;
  subtreeProductCount: number;
  updatedAt: string;
}

export interface AdminCategoryDetail {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  effectiveActive: boolean;
  parentHidden: boolean;
  productCount: number;
  subtreeProductCount: number;
  updatedAt: string;
  parent: AdminCategoryParentSummary | null;
  children: AdminCategoryChildSummary[];
}

export interface CategoryVisibilityResult {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  effectiveActive: boolean;
  parentHidden: boolean;
  updatedAt: string;
}

export const adminCategoriesKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('categories'), actorId] as const,
  tree: (actorId: string) => [...adminCategoriesKeys.all(actorId), 'tree'] as const,
  detail: (actorId: string, id: string) =>
    [...adminCategoriesKeys.all(actorId), 'detail', id] as const,
};

export function categoryVisibilityBadge(category: {
  isActive: boolean;
  effectiveActive?: boolean;
  parentHidden?: boolean;
}): { text: string; variant: 'active' | 'hidden' | 'parent-hidden' } {
  if (!category.isActive) {
    return { text: 'Đang ẩn', variant: 'hidden' };
  }
  if (category.parentHidden) {
    return { text: 'Bị ẩn do cha', variant: 'parent-hidden' };
  }
  return { text: 'Đang hiện', variant: 'active' };
}

export function categoryErrorText(error: unknown, target: RequestTarget): string {
  switch (classifyRequestError(error, target)) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
    case 'forbidden':
      return 'Tài khoản của bạn không còn quyền quản trị.';
    case 'not-found':
      return 'Không tìm thấy danh mục này.';
    case 'invalid':
      return 'Dữ liệu danh mục không hợp lệ.';
    default:
      return 'Không tải được danh mục. Kiểm tra kết nối rồi thử lại.';
  }
}
