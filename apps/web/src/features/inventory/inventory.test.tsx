import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider, useAuth } from '@/features/account';

import { inventoryKeys, quantity, readPage } from './inventory.api.js';

const actor: AuthenticatedUser = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'inventory@example.test',
  roles: ['ADMIN'],
};
const row = {
  id: '10000000-0000-4000-8000-000000000001',
  sku: 'TEST-INVENTORY',
  productName: 'Áo kiểm thử tồn',
  colorName: 'Đen',
  sizeCode: 'M',
  quantityOnHand: 10,
  reservedQuantity: 3,
  availableQuantity: 7,
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const error = (status: number) =>
  reply({ statusCode: status, code: 'TEST_ERROR', message: 'Synthetic error' }, status);
const page = {
  items: [row],
  total: 25,
  page: 1,
  pageSize: 12,
  totalPages: 3,
  asOf: '2026-11-10T01:00:00Z',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
function setup(
  path = '/admin/inventory',
  user: AuthenticatedUser | null = actor,
  override?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined,
) {
  let current = user;
  const requests: { url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, init });
      if (url.pathname === '/api/auth/refresh')
        return current ? reply({ accessToken: current.id, user: current }) : error(401);
      if (url.pathname === '/api/auth/login') {
        const email = JSON.parse(String(init?.body)).email as string;
        current = {
          ...actor,
          id: email === actor.email ? actor.id : 'b0000000-0000-4000-8000-000000000002',
          email,
        };
        return reply({ accessToken: current.id, user: current });
      }
      if (url.pathname === '/api/auth/logout') {
        current = null;
        return reply({});
      }
      const custom = override?.(url, init);
      if (custom) return custom;
      if (url.pathname === '/api/admin/inventory')
        return reply({ ...page, page: Number(url.searchParams.get('page') ?? 1) });
      if (url.pathname.startsWith('/api/admin/inventory/'))
        return reply({
          ...row,
          asOf: page.asOf,
          movements: {
            items: [{ id: 'm1', movementType: 'SALE', quantityDelta: -2, createdAt: page.asOf }],
            total: 25,
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: 12,
            totalPages: 3,
          },
        });
      if (url.pathname === '/api/cart') return reply({ items: [], itemCount: 0 });
      if (url.pathname === '/api/products') return reply({ ...page, items: [] });
      throw new Error('Unexpected test request ' + url.pathname);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const holder: { auth?: ReturnType<typeof useAuth>; go?: (path: string) => void } = {};
  function Probe() {
    holder.auth = useAuth();
    holder.go = useNavigate();
    const loc = useLocation();
    return <output data-testid="location">{loc.pathname + loc.search}</output>;
  }
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Probe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { client, requests, auth: () => holder.auth!, go: (next: string) => holder.go!(next) };
}
afterEach(() => vi.unstubAllGlobals());
describe('UC-13.1 tồn kho web', () => {
  it('UC-13.1/AC2 null khác0, URL trang được giới hạn an toàn', () => {
    expect(quantity(null)).toBe('Chưa có dữ liệu');
    expect(quantity(0)).toBe('0');
    for (const raw of ['0', '-1', '1e3', '2.5', '9999999999', '//evil.test'])
      expect(readPage(raw)).toBe(1);
    expect(readPage('2')).toBe(2);
  });
  it.each([null, { ...actor, roles: ['CUSTOMER'] }])(
    'UC-13.1/AC1 guest/customer không gọi API quản trị %j',
    async (user) => {
      const t = setup('/admin/inventory', user);
      await screen.findByRole('heading', { name: user ? 'Không đủ quyền truy cập' : 'Đăng nhập' });
      expect(t.requests.filter((r) => r.url.pathname.startsWith('/api/admin/'))).toHaveLength(0);
    },
  );
  it('UC-13.1/AC4 phân trang, chi tiết và quay lại giữ trang; request có signal và bearer', async () => {
    const t = setup('/admin/inventory?page=2');
    const link = await screen.findByRole('link', { name: 'Áo kiểm thử tồn · Đen / M' });
    expect(link).toHaveAttribute('href', `/admin/inventory/${row.id}?returnPage=2`);
    const req = t.requests.find((r) => r.url.pathname === '/api/admin/inventory')!;
    expect(req.init?.signal).toBeInstanceOf(AbortSignal);
    expect(req.init?.headers).toMatchObject({ Authorization: `Bearer ${actor.id}` });
    fireEvent.click(link);
    await screen.findByRole('heading', { name: 'Lịch sử biến động' });
    expect(screen.getByText('Bán hàng')).toBeInTheDocument();
    expect(screen.getByText('-2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('page=2&returnPage=2'),
    );
    fireEvent.click(screen.getByRole('link', { name: '← Về tồn kho' }));
    await screen.findByRole('heading', { name: 'Quản lý tồn kho' });
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/inventory?page=2');
  });
  it('UC-13.1/AC4 tải/rỗng và thiếu tồn không giả0', async () => {
    const d = deferred<Response>();
    setup('/admin/inventory', actor, (url) =>
      url.pathname === '/api/admin/inventory' ? d.promise : undefined,
    );
    await screen.findByText('Đang tải tồn kho…');
    await act(async () => d.resolve(reply({ ...page, items: [], total: 0 })));
    expect(await screen.findByText('Chưa có biến thể sản phẩm.')).toBeInTheDocument();
  });
  it('UC-13.1/AC5 403 dọn cache, kết quả GET cũ không khôi phục', async () => {
    const delayed = deferred<Response>();
    let calls = 0;
    const t = setup('/admin/inventory', actor, (url) => {
      if (url.pathname === '/api/admin/inventory' && ++calls > 1) return delayed.promise;
      if (url.pathname.startsWith('/api/admin/inventory/')) return error(403);
    });
    await screen.findByRole('link', { name: 'Áo kiểm thử tồn · Đen / M' });
    const refetch = t.client.refetchQueries({ queryKey: inventoryKeys.all(actor.id) });
    await waitFor(() => expect(calls).toBe(2));
    act(() => t.go(`/admin/inventory/${row.id}`));
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    await act(async () => {
      delayed.resolve(reply(page));
      await refetch;
    });
    expect(
      t.client
        .getQueriesData({ queryKey: inventoryKeys.all(actor.id) })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(screen.queryByText('Áo kiểm thử tồn')).not.toBeInTheDocument();
  });
  it('UC-13.1/AC5 logout hủy request, GET cũ không trở lại cache phiên', async () => {
    const d = deferred<Response>();
    const t = setup('/admin/inventory', actor, (url) =>
      url.pathname === '/api/admin/inventory' ? d.promise : undefined,
    );
    await screen.findByText('Đang tải tồn kho…');
    const req = t.requests.find((r) => r.url.pathname === '/api/admin/inventory')!;
    await act(async () => t.auth().logout());
    expect(req.init?.signal?.aborted).toBe(true);
    await act(async () => d.resolve(reply(page)));
    expect(
      t.client
        .getQueriesData({ queryKey: inventoryKeys.all(actor.id) })
        .every(([, data]) => data === undefined),
    ).toBe(true);
  });
  it.each(['sameActor', 'actorB'])(
    'UC-13.1/AC5 %s không nhận GET của phiên trước',
    async (mode) => {
      const gate = deferred<Response>();
      let delay = false;
      const t = setup('/admin/inventory', actor, (url) =>
        url.pathname === '/api/admin/inventory' && delay ? gate.promise : undefined,
      );
      await screen.findByRole('link', { name: 'Áo kiểm thử tồn · Đen / M' });
      delay = true;
      act(() => {
        void t.client.invalidateQueries({ queryKey: inventoryKeys.all(actor.id) });
      });
      await waitFor(() =>
        expect(t.requests.filter((r) => r.url.pathname === '/api/admin/inventory')).toHaveLength(2),
      );
      await act(async () => t.auth().logout());
      delay = false;
      await act(async () =>
        t.auth().login({
          email: mode === 'sameActor' ? actor.email : 'inventory-b@example.test',
          password: 'synthetic-test-only',
        }),
      );
      act(() => t.go('/admin/inventory'));
      await screen.findByRole('link', { name: 'Áo kiểm thử tồn · Đen / M' });
      await act(async () =>
        gate.resolve(reply({ ...page, items: [{ ...row, productName: 'DỮ LIỆU PHIÊN CŨ' }] })),
      );
      expect(screen.queryByText(/DỮ LIỆU PHIÊN CŨ/)).not.toBeInTheDocument();
      const cached = t.client.getQueriesData({ queryKey: ['session', 'admin', 'inventory'] });
      expect(JSON.stringify(cached)).not.toContain('DỮ LIỆU PHIÊN CŨ');
    },
  );
  it.each([400, 404, 422])(
    'UC-13.1/AC1 lỗi%d không retry; không hiển thị rỗng thay lỗi',
    async (status) => {
      const t = setup('/admin/inventory', actor, (url) =>
        url.pathname === '/api/admin/inventory' ? error(status) : undefined,
      );
      await screen.findByRole('alert');
      expect(screen.queryByText('Chưa có biến thể sản phẩm.')).not.toBeInTheDocument();
      expect(t.requests.filter((r) => r.url.pathname === '/api/admin/inventory')).toHaveLength(1);
    },
  );
});
