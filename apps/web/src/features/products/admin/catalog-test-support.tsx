import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider, useAuth } from '@/features/account';

import {
  type AdminCatalogDetail,
  computeCreateProductRequestHash,
  type CreateProductPayload,
} from './admin-catalog.api.js';

export const actorA: AuthenticatedUser = {
  id: 'a0000000-0000-4000-8000-00000000000a',
  email: 'a@example.test',
  roles: ['ADMIN'],
};
export const actorB: AuthenticatedUser = {
  id: 'b0000000-0000-4000-8000-00000000000b',
  email: 'b@example.test',
  roles: ['ADMIN'],
};
export const product: AdminCatalogDetail = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Áo khoác linen',
  slug: 'ao-khoac-linen',
  priceFrom: '199000',
  isActive: false,
  adminDisabled: false,
  statusVersion: 0,
  contentVersion: 0,
  adminContentFields: [],
  imagesVersion: 0,
  imagesManagedByAdmin: false,
  isCustom: false,
  createPayloadHash: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  imageUrl: null,
  category: { id: 'c1', name: 'Áo khoác', slug: 'ao-khoac', isActive: false },
  brand: null,
  description: 'Mô tả sản phẩm',
  material: null,
  careInstructions: null,
  isFeatured: false,
  audience: null,
  variants: [
    {
      id: 'v1',
      sku: 'SKU-AN-001',
      color: { code: 'den', name: 'Đen', hex: null },
      sizeCode: 'M',
      listPrice: '199000',
      salePrice: null,
      isActive: false,
      isCustom: false,
      adminManagedFields: [],
      updatedAt: '2026-01-02T00:00:00Z',
    },
  ],
  images: [],
};
export const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const failure = (status: number) =>
  reply(
    {
      statusCode: status,
      code: `HTTP_${status}`,
      message: 'Synthetic error',
      path: '/api/admin/products',
      timestamp: '',
    },
    status,
  );
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
export interface Recorded {
  path: string;
  signal?: AbortSignal | null;
  token?: string;
  method: string;
  body?: unknown;
}
export function backend() {
  const state: {
    actor: AuthenticatedUser | null;
    total: number;
    products: AdminCatalogDetail[];
    uploadsEnabled?: boolean;
    override?: (r: Recorded) => Promise<Response> | Response | undefined;
  } = { actor: actorA, total: 25, products: [product], uploadsEnabled: true };
  const requests: Recorded[] = [];
  let issuedTicketCount = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
      const r: Recorded = {
        path: url.pathname + url.search,
        signal: init?.signal,
        method: init?.method ?? 'GET',
        token: (init?.headers as Record<string, string>)?.Authorization,
        body: isFormData ? '[FormData]' : init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(r);
      const override = state.override?.(r);
      if (override) return override;
      if (url.pathname === '/api/uploads/config') {
        return reply({
          enabled: state.uploadsEnabled ?? true,
          maxBytes: 5_242_880,
          formats: ['jpg', 'png', 'webp'],
        });
      }
      if (url.pathname === '/api/admin/products/upload-tickets' && r.method === 'POST') {
        if (state.uploadsEnabled === false) {
          return reply(
            { statusCode: 503, code: 'UPLOADS_DISABLED', message: 'Máy chủ chưa bật tải ảnh.' },
            503,
          );
        }
        issuedTicketCount += 1;
        const actorId = state.actor?.id ?? actorA.id;
        const key = `freya/products/${actorId}/img-${issuedTicketCount}`;
        return reply({
          uploadUrl: 'https://upload.test/image/upload',
          fields: { public_id: key, signature: 'sig-test' },
          key,
          expiresAt: '2026-11-19T16:00:00.000Z',
          maxBytes: 5_242_880,
          formats: ['jpg', 'png', 'webp'],
        });
      }
      if (url.hostname === 'upload.test') {
        return reply({ public_id: 'uploaded' });
      }
      const session = () =>
        state.actor ? reply({ accessToken: state.actor.id, user: state.actor }) : failure(401);
      if (url.pathname === '/api/auth/refresh') return session();
      if (url.pathname === '/api/auth/logout') {
        state.actor = null;
        return reply({});
      }
      if (url.pathname === '/api/auth/login') {
        state.actor =
          (JSON.parse(String(init?.body)) as { email: string }).email === actorB.email
            ? actorB
            : actorA;
        return session();
      }
      if (url.pathname === '/api/admin/products/create-options') {
        return reply({
          brands: [{ id: 'br-1', name: 'Maison Studio', slug: 'maison-studio' }],
          colors: [
            { id: 'col-1', code: 'den', name: 'Đen', hex: '#000000' },
            { id: 'col-2', code: 'trang', name: 'Trắng', hex: '#ffffff' },
          ],
          sizes: [
            { id: 'sz-1', code: 'S', sortOrder: 10 },
            { id: 'sz-2', code: 'M', sortOrder: 20 },
            { id: 'sz-3', code: 'L', sortOrder: 30 },
          ],
        });
      }
      if (url.pathname === '/api/admin/categories' && r.method === 'GET') {
        return reply([
          {
            id: 'cat-root',
            name: 'Áo',
            slug: 'ao',
            parentId: null,
            sortOrder: 10,
            isActive: true,
            effectiveActive: true,
            parentHidden: false,
            productCount: 0,
            subtreeProductCount: 1,
            updatedAt: '2026-11-10T08:00:00.000Z',
            children: [
              {
                id: 'cat-leaf',
                name: 'Áo sơ mi',
                slug: 'ao-so-mi',
                parentId: 'cat-root',
                sortOrder: 10,
                isActive: true,
                effectiveActive: true,
                parentHidden: false,
                productCount: 1,
                subtreeProductCount: 1,
                updatedAt: '2026-11-10T08:00:00.000Z',
                children: [],
              },
            ],
          },
        ]);
      }
      if (url.pathname === '/api/admin/products' && r.method === 'POST') {
        const body = r.body as CreateProductPayload;
        const resolvedSlug = body.slug ?? 'san-pham-moi';
        const hash = computeCreateProductRequestHash({ ...body, slug: resolvedSlug });
        const existing = state.products.find((p) => p.id === body.id);
        if (existing) {
          if (existing.createPayloadHash === hash) return reply(existing, 200);
          return reply(
            {
              statusCode: 409,
              code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
              message: 'UUID sản phẩm đã được dùng cho yêu cầu tạo khác.',
            },
            409,
          );
        }
        const createdImages = (body.images ?? []).map((img, idx) => ({
          id: img.id,
          url: `https://cdn.test/${img.key}.jpg`,
          alt: img.alt ?? null,
          sortOrder: idx,
          color: null,
        }));
        const createdVariants = body.variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          color:
            v.colorId === 'col-2'
              ? { code: 'trang', name: 'Trắng', hex: '#ffffff' }
              : { code: 'den', name: 'Đen', hex: '#000000' },
          sizeCode: v.sizeId === 'sz-1' ? 'S' : v.sizeId === 'sz-3' ? 'L' : 'M',
          listPrice: v.listPrice,
          salePrice: v.salePrice ?? null,
          isActive: v.isActive ?? true,
          isCustom: true,
          adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
          updatedAt: '2026-11-20T01:00:00.000Z',
        }));
        const prices = createdVariants.map((v) => Number(v.salePrice ?? v.listPrice));
        const priceFrom = String(Math.min(...prices));
        const created: AdminCatalogDetail = {
          id: body.id,
          name: body.name,
          slug: resolvedSlug,
          priceFrom,
          isActive: false,
          adminDisabled: true,
          statusVersion: 1,
          contentVersion: 1,
          adminContentFields: ['name', 'description', 'material', 'careInstructions'],
          imagesVersion: createdImages.length > 0 ? 1 : 0,
          imagesManagedByAdmin: createdImages.length > 0,
          isCustom: true,
          createPayloadHash: hash,
          createdAt: '2026-11-20T01:00:00.000Z',
          updatedAt: '2026-11-20T01:00:00.000Z',
          imageUrl: createdImages[0]?.url ?? null,
          category: { id: body.categoryId, name: 'Áo sơ mi', slug: 'ao-so-mi', isActive: true },
          brand: body.brandId ? { id: body.brandId, name: 'Maison Studio' } : null,
          description: body.description ?? null,
          material: body.material ?? null,
          careInstructions: body.careInstructions ?? null,
          isFeatured: false,
          audience: body.audience ?? null,
          variants: createdVariants,
          images: createdImages,
        };
        state.products = [created, ...state.products];
        state.total += 1;
        return reply(created, 201);
      }
      if (url.pathname === '/api/admin/products') {
        const page = Number(url.searchParams.get('page') ?? 1);
        const pageSize = Number(url.searchParams.get('pageSize') ?? 12);
        return reply({
          items: state.products,
          total: state.total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil(state.total / pageSize)),
        });
      }
      if (url.pathname === `/api/admin/products/${product.id}/status` && r.method === 'PATCH') {
        const current = state.products.find((p) => p.id === product.id) ?? product;
        const body = r.body as { adminDisabled: boolean; expectedVersion: number };
        if (body.expectedVersion !== current.statusVersion) return failure(409);
        const updated = {
          ...current,
          adminDisabled: body.adminDisabled,
          isActive: !body.adminDisabled,
          statusVersion: current.statusVersion + 1,
        };
        state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
        return reply(updated);
      }
      if (url.pathname === `/api/admin/products/${product.id}/content` && r.method === 'PATCH') {
        const current = state.products.find((p) => p.id === product.id) ?? product;
        const body = r.body as {
          name: string;
          description: string | null;
          material: string | null;
          careInstructions: string | null;
          expectedVersion: number;
        };
        if (body.expectedVersion !== current.contentVersion) return failure(409);
        const changedFields = (
          ['name', 'description', 'material', 'careInstructions'] as const
        ).filter((f) => current[f] !== body[f]);
        const isNoOp = changedFields.length === 0;
        const updated = {
          ...current,
          name: body.name,
          description: body.description,
          material: body.material,
          careInstructions: body.careInstructions,
          contentVersion: isNoOp ? current.contentVersion : current.contentVersion + 1,
          adminContentFields: Array.from(
            new Set([...current.adminContentFields, ...changedFields]),
          ),
        };
        state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
        return reply({
          id: updated.id,
          name: updated.name,
          description: updated.description,
          material: updated.material,
          careInstructions: updated.careInstructions,
          contentVersion: updated.contentVersion,
          adminContentFields: updated.adminContentFields,
        });
      }
      if (url.pathname === '/api/admin/products/variant-options') {
        return reply({
          colors: [
            { id: 'col-1', code: 'den', name: 'Đen', hex: '#000000' },
            { id: 'col-2', code: 'trang', name: 'Trắng', hex: '#ffffff' },
          ],
          sizes: [
            { id: 'sz-1', code: 'S', sortOrder: 10 },
            { id: 'sz-2', code: 'M', sortOrder: 20 },
            { id: 'sz-3', code: 'L', sortOrder: 30 },
          ],
        });
      }
      if (url.pathname === `/api/admin/products/${product.id}/variants` && r.method === 'POST') {
        const body = r.body as {
          id: string;
          colorId: string;
          sizeId: string;
          sku: string;
          listPrice: string;
          salePrice?: string | null;
          isActive?: boolean;
        };
        const current = state.products.find((p) => p.id === product.id) ?? product;
        if (current.variants.some((v) => v.sku === body.sku)) {
          return reply({ statusCode: 409, code: 'SKU_EXISTS', message: 'SKU đã tồn tại' }, 409);
        }
        const createdVariant = {
          id: body.id,
          sku: body.sku,
          color:
            body.colorId === 'col-2'
              ? { code: 'trang', name: 'Trắng', hex: '#ffffff' }
              : { code: 'den', name: 'Đen', hex: '#000000' },
          sizeCode: body.sizeId === 'sz-1' ? 'S' : body.sizeId === 'sz-3' ? 'L' : 'M',
          listPrice: body.listPrice,
          salePrice: body.salePrice ?? null,
          isActive: body.isActive ?? true,
          isCustom: true,
          adminManagedFields: ['listPrice', 'salePrice', 'isActive'],
          updatedAt: '2026-11-14T10:00:00.000Z',
        };
        const updated = {
          ...current,
          variants: [...current.variants, createdVariant],
        };
        state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
        return reply(createdVariant, 201);
      }
      const variantMatch = url.pathname.match(
        new RegExp(`^/api/admin/products/${product.id}/variants/([^/]+)$`),
      );
      if (variantMatch && r.method === 'PATCH') {
        const variantId = variantMatch[1];
        const body = r.body as {
          listPrice?: string;
          salePrice?: string | null;
          isActive?: boolean;
          expectedUpdatedAt: string;
        };
        const current = state.products.find((p) => p.id === product.id) ?? product;
        const targetVariant = current.variants.find((v) => v.id === variantId);
        if (!targetVariant) return failure(404);
        if (targetVariant.updatedAt !== body.expectedUpdatedAt) {
          return reply(
            { statusCode: 409, code: 'CONCURRENT_MODIFICATION', message: 'CAS mismatch' },
            409,
          );
        }
        if (current.isActive && targetVariant.isActive && body.isActive === false) {
          const activeCount = current.variants.filter((v) => v.isActive).length;
          if (activeCount <= 1) {
            return reply(
              {
                statusCode: 422,
                code: 'LAST_ACTIVE_VARIANT_BLOCKED',
                message: 'Cannot disable last active variant',
              },
              422,
            );
          }
        }
        const updatedVariant = {
          ...targetVariant,
          listPrice: body.listPrice ?? targetVariant.listPrice,
          salePrice: body.salePrice !== undefined ? body.salePrice : targetVariant.salePrice,
          isActive: body.isActive !== undefined ? body.isActive : targetVariant.isActive,
          updatedAt: '2026-11-14T12:00:00.000Z',
          adminManagedFields: Array.from(
            new Set([...(targetVariant.adminManagedFields ?? []), 'listPrice', 'salePrice']),
          ),
        };
        const updated = {
          ...current,
          variants: current.variants.map((v) => (v.id === variantId ? updatedVariant : v)),
        };
        state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
        return reply(updatedVariant);
      }
      const imagesMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images$/);
      if (imagesMatch && r.method === 'PUT') {
        const targetId = imagesMatch[1];
        const current = state.products.find((p) => p.id === targetId);
        if (!current) return failure(404);
        const body = r.body as {
          expectedVersion: number;
          items: { id: string; key?: string; alt: string | null }[];
        };
        if (body.expectedVersion !== (current.imagesVersion ?? 0)) {
          return reply(
            {
              statusCode: 409,
              code: 'CONCURRENT_MODIFICATION',
              message: 'Bộ ảnh đã thay đổi trên máy chủ.',
            },
            409,
          );
        }
        const hasNew = body.items.some((i) => Boolean(i.key));
        if (hasNew && body.items.length > 8) {
          return reply(
            {
              statusCode: 422,
              code: 'IMAGE_LIMIT_EXCEEDED',
              message: 'Mỗi sản phẩm tối đa 8 ảnh khi tải thêm ảnh mới.',
            },
            422,
          );
        }
        if (body.items.length === 0 && current.isActive) {
          return reply(
            {
              statusCode: 422,
              code: 'LAST_IMAGE_OF_ACTIVE_PRODUCT',
              message: 'Không thể gỡ ảnh cuối cùng khi sản phẩm đang mở bán.',
            },
            422,
          );
        }
        const existingById = new Map(current.images.map((i) => [i.id, i]));
        const nextImages = body.items.map((item, idx) => {
          const old = existingById.get(item.id);
          return {
            id: item.id,
            url: item.key ? `https://cdn.test/${item.key}.jpg` : (old?.url ?? ''),
            alt: item.alt,
            sortOrder: idx,
            color: item.key ? null : (old?.color ?? null),
          };
        });
        const isNoOp =
          !hasNew &&
          nextImages.length === current.images.length &&
          nextImages.every(
            (img, idx) =>
              current.images[idx]?.id === img.id &&
              (current.images[idx]?.alt ?? null) === (img.alt ?? null),
          );
        const nextVersion = isNoOp
          ? (current.imagesVersion ?? 0)
          : (current.imagesVersion ?? 0) + 1;
        const nextManaged = isNoOp ? Boolean(current.imagesManagedByAdmin) : true;
        const updated = {
          ...current,
          imageUrl: nextImages[0]?.url ?? null,
          imagesVersion: nextVersion,
          imagesManagedByAdmin: nextManaged,
          images: nextImages,
        };
        state.products = state.products.map((p) => (p.id === updated.id ? updated : p));
        return reply({
          id: updated.id,
          imagesVersion: updated.imagesVersion,
          imagesManagedByAdmin: updated.imagesManagedByAdmin,
          imageUrl: updated.imageUrl,
          images: updated.images,
        });
      }
      if (url.pathname === `/api/admin/products/${product.id}`)
        return reply(state.products.find((p) => p.id === product.id) ?? product);
      const otherDetailMatch = url.pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (otherDetailMatch && r.method === 'GET') {
        const found = state.products.find((p) => p.id === otherDetailMatch[1]);
        if (found) return reply(found);
      }
      if (url.pathname.startsWith('/api/admin/products/')) return failure(404);
      if (url.pathname === '/api/cart') return reply({ items: [], itemCount: 0 });
      if (url.pathname === '/api/notifications' || url.pathname === '/api/admin/notifications')
        return reply({ items: [], total: 0, unreadCount: 0, page: 1, pageSize: 20 });
      if (url.pathname.startsWith('/api/products'))
        return reply({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });
      throw new Error(`Unexpected request: ${r.path}`);
    }),
  );
  return {
    state,
    requests,
    adminRequests: () =>
      requests.filter(
        (r) => r.path.startsWith('/api/admin/') && !r.path.startsWith('/api/admin/notifications'),
      ),
  };
}
export function mountCatalog(path = '/admin/products') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const holder: { auth?: ReturnType<typeof useAuth>; go?: (path: string) => void } = {};
  function Probe() {
    holder.auth = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    holder.go = (path) => navigate(path);
    return (
      <>
        <output data-testid="location">{location.pathname + location.search}</output>
        <button onClick={() => navigate(-1)}>History back</button>
        <button onClick={() => navigate(1)}>History forward</button>
      </>
    );
  }
  const result = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Probe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, auth: () => holder.auth!, go: (path: string) => holder.go!(path) };
}
