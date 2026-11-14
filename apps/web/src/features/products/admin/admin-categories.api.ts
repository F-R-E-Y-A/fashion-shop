import { ApiError, classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

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

export interface CreateAdminCategoryPayload {
  id: string;
  name: string;
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface UpdateAdminCategoryPayload {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  expectedUpdatedAt: string;
}

export interface NormalizedCreateCategoryPayload {
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
}

export interface UncertainCreateCategoryState {
  operationId?: number;
  id: string;
  payload: NormalizedCreateCategoryPayload;
  status?: 'pending' | 'uncertain';
  recheckedNotFound?: boolean;
}

export interface UncertainEditCategoryState {
  operationId?: number;
  id: string;
  payload: UpdateAdminCategoryPayload;
  status?: 'pending' | 'uncertain';
  recheckedUnconfirmed?: boolean;
}

export const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATEGORY_MAX_INT32 = 2_147_483_647;

export const adminCategoriesKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('categories'), actorId] as const,
  tree: (actorId: string) => [...adminCategoriesKeys.all(actorId), 'tree'] as const,
  detail: (actorId: string, id: string) =>
    [...adminCategoriesKeys.all(actorId), 'detail', id] as const,
  uncertainCreate: (actorId: string, epoch: number) =>
    [...adminCategoriesKeys.all(actorId), 'uncertain-create', epoch] as const,
  uncertainEdit: (actorId: string, epoch: number, id: string) =>
    [...adminCategoriesKeys.all(actorId), 'uncertain-edit', epoch, id] as const,
};

export function slugifyCategoryName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function doesCategoryMatchCreatePayload(
  category: AdminCategoryDetail,
  payload: NormalizedCreateCategoryPayload,
): boolean {
  return (
    category.name === payload.name &&
    category.slug === payload.slug &&
    category.parentId === payload.parentId &&
    category.sortOrder === payload.sortOrder
  );
}

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

export function categoryMutationErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    const status = error.body.statusCode;
    const msg = typeof error.body.message === 'string' ? error.body.message : '';
    if (status === 409) {
      return msg || 'Xung đột dữ liệu hoặc phiên bản trên máy chủ. Vui lòng tải lại.';
    }
    if (status === 422) {
      return msg || 'Thao tác vi phạm ràng buộc cây danh mục hai cấp hoặc sản phẩm.';
    }
    if (status === 400) {
      return msg || 'Dữ liệu gửi lên không hợp lệ.';
    }
    if (status === 404) {
      return msg || 'Không tìm thấy danh mục hoặc danh mục cha.';
    }
    if (status === 403) {
      return 'Tài khoản của bạn không còn quyền quản trị.';
    }
  }
  return 'Không thể xác nhận kết quả từ máy chủ. Kiểm tra trạng thái trước khi thao tác tiếp.';
}
