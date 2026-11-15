import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider, useAuth } from '@/features/account';

import type { AdminCatalogDetail } from './admin-catalog.api.js';

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
    override?: (r: Recorded) => Promise<Response> | Response | undefined;
  } = { actor: actorA, total: 25, products: [product] };
  const requests: Recorded[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const r: Recorded = {
        path: url.pathname + url.search,
        signal: init?.signal,
        method: init?.method ?? 'GET',
        token: (init?.headers as Record<string, string>)?.Authorization,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(r);
      const override = state.override?.(r);
      if (override) return override;
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
      if (url.pathname === `/api/admin/products/${product.id}`)
        return reply(state.products.find((p) => p.id === product.id) ?? product);
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
