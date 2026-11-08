import { classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

import type { CatalogQuery } from './catalog-query.js';

interface Color {
  code: string;
  name: string;
  hex: string | null;
}
export interface AdminCatalogProduct {
  id: string;
  name: string;
  slug: string;
  priceFrom: string;
  isActive: boolean;
  adminDisabled: boolean;
  statusVersion: number;
  createdAt: string;
  imageUrl: string | null;
  category: { id: string; name: string; slug: string; isActive: boolean };
  brand: { id: string; name: string } | null;
}
export interface AdminCatalogDetail extends AdminCatalogProduct {
  description: string | null;
  material: string | null;
  careInstructions: string | null;
  isFeatured: boolean;
  audience: string | null;
  updatedAt: string;
  variants: {
    id: string;
    sku: string;
    color: Color;
    sizeCode: string;
    listPrice: string;
    salePrice: string | null;
    isActive: boolean;
  }[];
  images: { id: string; url: string; alt: string | null; color: Color | null; sortOrder: number }[];
}
export interface AdminCatalogPage {
  items: AdminCatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
export const adminCatalogKeys = {
  all: (actorId: string) => [...sessionQueryKeys.adminResource('products'), actorId] as const,
  lists: (actorId: string) => [...adminCatalogKeys.all(actorId), 'list'] as const,
  list: (actorId: string, query: CatalogQuery) =>
    [
      ...adminCatalogKeys.all(actorId),
      'list',
      query.q,
      query.status,
      query.sort,
      query.pageSize,
      query.page,
    ] as const,
  detail: (actorId: string, id: string) =>
    [...adminCatalogKeys.all(actorId), 'detail', id] as const,
};
export type ProductStatusResult = Pick<
  AdminCatalogProduct,
  'id' | 'name' | 'isActive' | 'adminDisabled' | 'statusVersion'
>;
export function catalogStatusLabel(
  product: Pick<AdminCatalogProduct, 'isActive' | 'adminDisabled'>,
) {
  return product.adminDisabled
    ? 'Ngừng bán thủ công'
    : product.isActive
      ? 'Đang bật'
      : 'Chưa bật từ nguồn';
}
export function catalogErrorText(error: unknown, target: RequestTarget) {
  switch (classifyRequestError(error, target)) {
    case 'unauthenticated':
      return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
    case 'not-found':
      return 'Không tìm thấy sản phẩm này.';
    case 'invalid':
      return 'Điều kiện tìm sản phẩm không hợp lệ.';
    case 'forbidden':
      return 'Tài khoản của bạn không còn quyền quản trị.';
    default:
      return 'Không tải được sản phẩm. Kiểm tra kết nối rồi thử lại.';
  }
}
