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
  isCustom?: boolean;
  createPayloadHash?: string | null;
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
export interface AdminBrandOption {
  id: string;
  name: string;
  slug: string;
}
export interface AdminCreateOptionsResponse {
  brands: AdminBrandOption[];
  colors: AdminVariantColorOption[];
  sizes: AdminVariantSizeOption[];
}
export interface CreateInitialVariantPayload {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  listPrice: string;
  salePrice?: string | null;
  isActive?: boolean;
}
export interface CreateInitialImagePayload {
  id: string;
  key: string;
  alt?: string | null;
}
export interface CreateProductPayload {
  id: string;
  name: string;
  slug?: string | null;
  categoryId: string;
  brandId?: string | null;
  description?: string | null;
  material?: string | null;
  careInstructions?: string | null;
  audience?: 'nam' | 'nu' | 'unisex' | null;
  isFeatured?: boolean;
  variants: CreateInitialVariantPayload[];
  images?: CreateInitialImagePayload[];
}
export interface UncertainProductCreate {
  operationId: number;
  productId: string;
  payload: CreateProductPayload;
  requestHash: string;
  status: 'pending' | 'uncertain' | 'not-found' | 'uuid-conflict';
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
  createOptions: (actorId: string) => [...adminCatalogKeys.all(actorId), 'create-options'] as const,
  uncertainCreate: (actorId: string, epoch: number) =>
    ['uncertain', 'admin', 'products', actorId, 'create', epoch] as const,
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

export function normalizeMoneyForHash(raw: string): string {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return s;
  const [whole, frac] = s.split('.');
  const cleanWhole = (whole ?? '0').replace(/^0+(?=\d)/, '') || '0';
  if (!frac) return cleanWhole;
  const cleanFrac = frac.replace(/0+$/, '');
  return cleanFrac ? `${cleanWhole}.${cleanFrac}` : cleanWhole;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x1_0000_0000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

export function computeCreateProductRequestHash(
  payload: CreateProductPayload & { slug: string },
): string {
  return sha256Hex(
    JSON.stringify({
      id: payload.id,
      name: payload.name.trim(),
      slug: payload.slug,
      categoryId: payload.categoryId,
      brandId: payload.brandId ?? null,
      description: payload.description ?? null,
      material: payload.material ?? null,
      careInstructions: payload.careInstructions ?? null,
      audience: payload.audience ?? null,
      isFeatured: payload.isFeatured ?? false,
      variants: payload.variants.map((v) => {
        const list = normalizeMoneyForHash(v.listPrice);
        const sale =
          v.salePrice !== undefined && v.salePrice !== null
            ? normalizeMoneyForHash(v.salePrice)
            : null;
        return {
          id: v.id,
          colorId: v.colorId,
          sizeId: v.sizeId,
          sku: v.sku,
          listPrice: list,
          salePrice: sale === list ? null : sale,
          isActive: v.isActive ?? true,
        };
      }),
      images: (payload.images ?? []).map((img) => ({
        id: img.id,
        key: img.key,
        alt: img.alt ?? null,
      })),
    }),
  );
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
      case 'PRODUCT_IMAGE_CONFLICT':
        return 'Mã hoặc vị trí của ảnh mới bị trùng. Hãy gỡ ảnh mới khỏi bản nháp rồi tải lại trước khi lưu.';
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
