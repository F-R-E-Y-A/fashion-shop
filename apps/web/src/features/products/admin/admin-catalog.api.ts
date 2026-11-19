import { type QueryClient } from '@tanstack/react-query';

import { ApiError, classifyRequestError, type RequestTarget, sessionQueryKeys } from '@/core';

import type { CatalogQuery } from './catalog-query.js';

export interface Color {
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
export interface AdminProductVariantItem {
  id: string;
  sku: string;
  colorId?: string;
  sizeId?: string;
  color: Color;
  sizeCode: string;
  listPrice: string;
  salePrice: string | null;
  isActive: boolean;
  isCustom?: boolean;
  adminManagedFields?: string[];
  updatedAt: string;
}
export interface AdminProductImageItem {
  id: string;
  url: string;
  alt: string | null;
  color: Color | null;
  sortOrder: number;
}
export interface AdminCatalogDetail extends AdminCatalogProduct {
  contentVersion: number;
  adminContentFields: string[];
  imagesVersion?: number;
  imagesManagedByAdmin?: boolean;
  description: string | null;
  material: string | null;
  careInstructions: string | null;
  isFeatured: boolean;
  audience: string | null;
  updatedAt: string;
  variants: AdminProductVariantItem[];
  images: AdminProductImageItem[];
}
export interface UploadConfigResponse {
  enabled: boolean;
  maxBytes: number;
  formats: string[];
}
export interface UploadTicketResponse {
  uploadUrl: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
  maxBytes: number;
  formats: string[];
}
export interface UpdateProductImagesItemPayload {
  id: string;
  key?: string;
  alt: string | null;
}
export interface UpdateProductImagesPayload {
  items: UpdateProductImagesItemPayload[];
  expectedVersion: number;
}
export interface AdminProductImagesResult {
  id: string;
  imagesVersion: number;
  imagesManagedByAdmin: boolean;
  imageUrl: string | null;
  images: AdminProductImageItem[];
}
export interface DraftProductImageItem {
  id: string;
  url: string;
  alt: string;
  color: Color | null;
  key?: string;
  isNew?: boolean;
}
export interface UncertainImagesUpdate {
  operationId: number;
  productId: string;
  payload: UpdateProductImagesPayload;
  draftItems: DraftProductImageItem[];
  status: 'pending' | 'uncertain';
}
export interface AdminVariantColorOption {
  id: string;
  code: string;
  name: string;
  hex: string | null;
}
export interface AdminVariantSizeOption {
  id: string;
  code: string;
  sortOrder: number;
}
export interface AdminVariantOptionsResponse {
  colors: AdminVariantColorOption[];
  sizes: AdminVariantSizeOption[];
}
export interface CreateProductVariantPayload {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  listPrice: string;
  salePrice?: string | null;
  isActive?: boolean;
}
export interface UpdateProductVariantPayload {
  listPrice?: string;
  salePrice?: string | null;
  isActive?: boolean;
  expectedUpdatedAt: string;
}
export interface UncertainVariantCreate {
  operationId: number;
  productId: string;
  id: string;
  payload: CreateProductVariantPayload;
  status: 'pending' | 'uncertain';
}
export interface UncertainVariantUpdate {
  operationId: number;
  productId: string;
  variantId: string;
  payload: UpdateProductVariantPayload;
  status: 'pending' | 'uncertain';
}
export interface ProductContentResult {
  id: string;
  name: string;
  description: string | null;
  material: string | null;
  careInstructions: string | null;
  contentVersion: number;
  adminContentFields: string[];
}
export interface ChangeProductContentInput {
  name: string;
  description: string | null;
  material: string | null;
  careInstructions: string | null;
  expectedVersion: number;
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
  variantOptions: (actorId: string) =>
    [...adminCatalogKeys.all(actorId), 'variant-options'] as const,
  uploadConfig: (actorId: string) => [...adminCatalogKeys.all(actorId), 'upload-config'] as const,
  imagesDraft: (actorId: string, epoch: number, productId: string) =>
    [...adminCatalogKeys.all(actorId), 'images-draft', epoch, productId] as const,
  uncertainImagesUpdate: (actorId: string, epoch: number, productId: string) =>
    ['uncertain', 'admin', 'products', actorId, 'images-update', epoch, productId] as const,
  uncertainVariantCreate: (actorId: string, epoch: number, productId: string) =>
    ['uncertain', 'admin-catalog', 'variant-create', actorId, epoch, productId] as const,
  uncertainVariantUpdate: (actorId: string, epoch: number, productId: string, variantId: string) =>
    ['uncertain', 'admin-catalog', 'variant-update', actorId, epoch, productId, variantId] as const,
};
const detailGenerations = new WeakMap<QueryClient, Map<string, number>>();
function detailGenScopeKey(actorId: string, productId: string): string {
  return `${actorId}:${productId}`;
}
export function getDetailGeneration(
  client: QueryClient,
  actorId: string,
  productId: string,
): number {
  return detailGenerations.get(client)?.get(detailGenScopeKey(actorId, productId)) ?? 0;
}
export function bumpDetailGeneration(
  client: QueryClient,
  actorId: string,
  productId: string,
): number {
  let map = detailGenerations.get(client);
  if (!map) {
    map = new Map();
    detailGenerations.set(client, map);
  }
  const key = detailGenScopeKey(actorId, productId);
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}
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
export function variantMutationErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.body.code) {
      case 'IDEMPOTENCY_PAYLOAD_MISMATCH':
        return 'Yêu cầu tạo biến thể bị từ chối: mã định danh đã được dùng với thông tin khác.';
      case 'SKU_EXISTS':
        return 'Mã SKU này đã tồn tại trong hệ thống. Vui lòng chọn mã SKU khác.';
      case 'COMBINATION_EXISTS':
        return 'Tổ hợp màu và kích cỡ này đã tồn tại cho sản phẩm này.';
      case 'CONCURRENT_MODIFICATION':
        return 'Biến thể đã được thay đổi trên máy chủ bởi người dùng khác. Vui lòng tải lại và xác nhận lại.';
      case 'LAST_ACTIVE_VARIANT_BLOCKED':
        return 'Không thể tắt biến thể hoạt động cuối cùng khi sản phẩm đang mở bán. Vui lòng ngừng bán sản phẩm trước.';
      case 'NO_ACTIVE_VARIANTS_FOR_ACTIVE_PRODUCT':
        return 'Không thể mở bán sản phẩm khi chưa có ít nhất một biến thể hoạt động.';
    }
  }
  return 'Thao tác không thành công. Vui lòng kiểm tra lại kết nối và thử lại.';
}
export function imagesMutationErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.body.code) {
      case 'IMAGE_LIMIT_EXCEEDED':
        return 'Mỗi sản phẩm tối đa 8 ảnh khi tải thêm ảnh mới.';
      case 'LAST_IMAGE_OF_ACTIVE_PRODUCT':
        return 'Không thể gỡ ảnh cuối cùng khi sản phẩm đang mở bán. Vui lòng chuyển sản phẩm sang Ngừng bán trước.';
      case 'INVALID_MEDIA':
        return typeof error.body.message === 'string'
          ? error.body.message
          : 'Ảnh tải lên không hợp lệ, đã quá hạn hoặc sai định dạng (JPG, PNG, WebP tối đa 5 MB).';
      case 'UPLOADS_DISABLED':
        return 'Máy chủ chưa cấu hình kho ảnh.';
      case 'UPLOADS_UNAVAILABLE':
        return 'Kho ảnh đang tạm thời lỗi. Vui lòng thử lại sau.';
      case 'CONCURRENT_MODIFICATION':
        return 'Bộ ảnh sản phẩm đã thay đổi trên máy chủ. Vui lòng tải bản mới để đối chiếu trước khi lưu.';
    }
    if (error.body.statusCode === 409) {
      return 'Bộ ảnh sản phẩm đã thay đổi trên máy chủ. Vui lòng tải bản mới để đối chiếu trước khi lưu.';
    }
    if (error.body.statusCode === 404) {
      return 'Sản phẩm không còn tồn tại.';
    }
    if (error.body.statusCode === 400) {
      return 'Dữ liệu bộ ảnh không hợp lệ.';
    }
  }
  return 'Không thể lưu bộ ảnh sản phẩm. Kiểm tra điều kiện rồi thử lại.';
}
