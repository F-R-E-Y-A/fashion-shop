import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';

import {
  AdminUserDetailPage,
  AdminUsersPage,
  AuthProvider,
  RequireAdmin,
  useAuth,
} from '@/features/account';

import { type AdminOrder, type AdminOrderPage } from '../admin-orders.api.js';
import { AdminOrderDetailPage } from '../AdminOrderDetailPage.js';
import { AdminOrdersPage } from '../AdminOrdersPage.js';
import { base } from './order-fixture.js';

export const actor = { id: 'admin1', email: 'admin@example.test', roles: ['ADMIN'] };
export const otherActor = { id: 'admin2', email: 'admin2@example.test', roles: ['ADMIN'] };
export const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const denied = (status = 403) =>
  reply(
    { statusCode: status, code: 'TEST', message: 'Từ chối', path: '/test', timestamp: '' },
    status,
  );

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function orderPage(order: AdminOrder = base): AdminOrderPage {
  return {
    items: [
      {
        ...order,
        itemCount: 1,
        paymentStatus: 'SUCCEEDED',
        gateway: 'VNPAY',
        refundedAmount: '0',
        refundPending: false,
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  };
}

export interface RecordedRequest {
  path: string;
  method: string;
  signal?: AbortSignal | null;
}

/** Backend giả chỉ kiểm vòng đời client; không chứng minh guard/tiền/kho của API thật. */
export function createBackend() {
  const calls: RecordedRequest[] = [];
  let currentActor = actor;
  let order = base;
  let override:
    ((request: RecordedRequest) => Response | Promise<Response> | undefined) | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path =
        new URL(String(input)).pathname.replace(/^\/api/, '') + new URL(String(input)).search;
      const request = { path, method: init?.method ?? 'GET', signal: init?.signal };
      calls.push(request);
      if (path === '/auth/login') {
        const email = (JSON.parse(String(init?.body)) as { email: string }).email;
        currentActor = email === otherActor.email ? otherActor : actor;
      }
      if (path === '/auth/refresh' || path === '/auth/login')
        return reply({ accessToken: `synthetic-${currentActor.id}`, user: currentActor });
      if (path === '/auth/logout') return reply({});
      const intercepted = override?.(request);
      if (intercepted) return intercepted;
      if (path.startsWith('/admin/users?'))
        return reply({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 });
      return reply(path.startsWith('/admin/orders?') ? orderPage(order) : order);
    }),
  );
  return {
    calls,
    override: (handler: typeof override) => {
      override = handler;
    },
    setOrder: (next: AdminOrder) => {
      order = next;
    },
  };
}

export function mount(path = '/admin/orders/o1') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, retryDelay: 0, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  const holder: { auth?: ReturnType<typeof useAuth> } = {};
  function Capture() {
    holder.auth = useAuth();
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Capture />
        <MemoryRouter initialEntries={[path]}>
          <Link to="/admin/users">Mở người dùng</Link>
          <Routes>
            <Route element={<RequireAdmin />}>
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
            </Route>
            <Route path="/login" element={<p>Đã kết thúc phiên</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { client, auth: () => holder.auth! };
}

export function installDialogStub() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal(): void };
  if (typeof proto.showModal === 'function') return;
  proto.showModal = function () {
    this.setAttribute('open', '');
  };
  proto.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
