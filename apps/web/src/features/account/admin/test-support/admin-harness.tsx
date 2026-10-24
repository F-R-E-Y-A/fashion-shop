import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { vi } from 'vitest';

import { AppRoutes } from '@/app';

import { AuthProvider, useAuth } from '../../AuthProvider.js';
import type { AuthenticatedUser } from '../../types.js';
import type { AdminUser } from '../admin-users.api.js';

/** Du lieu tong hop, khong phai nguoi that. */
export const adminA: AuthenticatedUser = {
  id: 'a0000000-0000-4000-8000-00000000000a',
  email: 'admin-a@example.test',
  roles: ['ADMIN', 'CUSTOMER'],
};
export const adminB: AuthenticatedUser = {
  id: 'b0000000-0000-4000-8000-00000000000b',
  email: 'admin-b@example.test',
  roles: ['ADMIN'],
};
export const customer: AuthenticatedUser = {
  id: 'c0000000-0000-4000-8000-00000000000c',
  email: 'khach@example.test',
  roles: ['CUSTOMER'],
};

export function makeUser(index: number, overrides: Partial<AdminUser> = {}): AdminUser {
  const suffix = String(index).padStart(12, '0');
  return {
    id: `10000000-0000-4000-8000-${suffix}`,
    email: `nguoi-dung-${index}@example.test`,
    status: 'ACTIVE',
    roles: ['CUSTOMER'],
    emailVerifiedAt: '2026-10-02T03:04:00.000Z',
    createdAt: new Date(Date.UTC(2026, 9, 1) - index * 60_000).toISOString(),
    ...overrides,
  };
}

/** Hai tai khoan quan tri cung co trong danh sach, nhu CSDL that. */
export function asAdminUser(user: AuthenticatedUser): AdminUser {
  return {
    id: user.id,
    email: user.email,
    status: 'ACTIVE',
    roles: [...user.roles].sort(),
    emailVerifiedAt: '2026-09-30T01:00:00.000Z',
    createdAt: '2026-09-30T00:00:00.000Z',
  };
}

export interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

export function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Moi lan doc la mot ban sao, nhu du lieu qua mang: cache khong bao gio tro vao state cua backend. */
export function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (body === undefined ? undefined : structuredClone(body)),
  } as Response;
}

export function apiError(status: number, code: string): Response {
  return json({ statusCode: status, code, message: code, path: '/api', timestamp: '' }, status);
}

export interface RecordedRequest {
  method: string;
  path: string;
  authorization?: string;
  signal?: AbortSignal;
}

type Override = (request: RecordedRequest) => Response | Promise<Response> | undefined;

/**
 * Backend gia cho khu quan tri: phien theo cookie (refresh tra nguoi dang "giu cookie"), danh sach
 * va chi tiet doc tu `users`, khoa/mo khoa doi trang thai that. `hold` giu phan hoi cua mot
 * request toi khi test tha; `override` tra loi rieng cho mot request. Ton trong AbortSignal nhu
 * fetch that.
 */
export function createAdminBackend(options: {
  session?: AuthenticatedUser | null;
  users?: AdminUser[];
}) {
  const state = {
    session: options.session === undefined ? adminA : options.session,
    users: options.users ?? [
      asAdminUser(adminA),
      ...Array.from({ length: 3 }, (_, i) => makeUser(i + 1)),
    ],
    tokenCounter: 0,
  };
  const requests: RecordedRequest[] = [];
  const holds: {
    match: (request: RecordedRequest) => boolean;
    gate: Deferred;
    ignoreAbort: boolean;
  }[] = [];
  const overrides: Override[] = [];
  const accounts: Record<string, AuthenticatedUser> = {
    [adminA.email]: adminA,
    [adminB.email]: adminB,
    [customer.email]: customer,
  };

  const session = () => {
    state.tokenCounter += 1;
    return { accessToken: `token-${state.tokenCounter}`, user: state.session };
  };

  const handle = (request: RecordedRequest, url: URL, init?: RequestInit): Response => {
    const { method, path } = request;
    const pathname = url.pathname.replace(/^\/api/, '');
    if (pathname === '/auth/refresh')
      return state.session ? json(session()) : apiError(401, 'UNAUTHORIZED');
    if (pathname === '/auth/login') {
      const { email } = JSON.parse(String(init?.body)) as { email: string };
      state.session = accounts[email] ?? null;
      return state.session ? json(session()) : apiError(401, 'UNAUTHORIZED');
    }
    if (pathname === '/auth/logout') {
      state.session = null;
      return json(undefined, 204);
    }
    if (pathname === '/cart') return json({ items: [], itemCount: 0 });
    if (pathname.startsWith('/products'))
      return json({ items: [], total: 42, page: 1, pageSize: 1, totalPages: 42 });
    if (!pathname.startsWith('/admin/users'))
      throw new Error(`Unexpected request: ${method} ${path}`);

    if (!state.session) return apiError(401, 'UNAUTHORIZED');
    if (!state.session.roles.includes('ADMIN')) return apiError(403, 'FORBIDDEN');

    if (pathname === '/admin/users') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 12);
      const total = state.users.length;
      return json({
        items: state.users.slice((page - 1) * pageSize, page * pageSize),
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }
    const match = /^\/admin\/users\/([^/]+)(?:\/(lock|unlock))?$/u.exec(pathname);
    const id = decodeURIComponent(match?.[1] ?? '');
    if (!/^[0-9a-f-]{36}$/u.test(id)) return apiError(400, 'BAD_REQUEST');
    const user = state.users.find((item) => item.id === id);
    if (!user) return apiError(404, 'NOT_FOUND');
    const action = match?.[2];
    if (!action) return json(user);
    if (action === 'lock') {
      if (id === state.session.id) return apiError(422, 'CANNOT_LOCK_SELF');
      if (user.status !== 'ACTIVE') return apiError(409, 'USER_NOT_ACTIVE');
      user.status = 'LOCKED';
    } else {
      if (user.status !== 'LOCKED') return apiError(409, 'USER_NOT_LOCKED');
      user.status = 'ACTIVE';
    }
    return json({ ...user });
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
      signal: init?.signal ?? undefined,
    };
    requests.push(request);
    const signal = request.signal;
    const aborted = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(signal.reason);
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    // Nhanh ignoreAbort khong cho promise nay: tranh "unhandled rejection" gia trong bao cao.
    aborted.catch(() => {});
    const hold = holds.find((item) => item.match(request));
    if (hold) {
      holds.splice(holds.indexOf(hold), 1);
      // ignoreAbort: phan hoi da ve toi trinh duyet truoc khi bi huy, chi den tay ung dung muon.
      if (hold.ignoreAbort) {
        await hold.gate.promise;
        return handle(request, url, init);
      }
      await Promise.race([hold.gate.promise, aborted]);
    }
    for (const override of overrides) {
      const result = override(request);
      if (result) return Promise.race([Promise.resolve(result), aborted]);
    }
    return Promise.race([Promise.resolve(handle(request, url, init)), aborted]);
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    state,
    requests,
    adminRequests: () => requests.filter((item) => item.path.startsWith('/api/admin/')),
    posts: () =>
      requests.filter((item) => item.method === 'POST' && item.path.startsWith('/api/admin/')),
    hold(match: (request: RecordedRequest) => boolean, options: { ignoreAbort?: boolean } = {}) {
      const gate = deferred();
      holds.push({ match, gate, ignoreAbort: options.ignoreAbort ?? false });
      return gate;
    },
    override(fn: Override) {
      overrides.push(fn);
    },
  };
}

/** jsdom chua co HTMLDialogElement.showModal: stub toi thieu, KHONG chung minh top layer hay inert. */
export function installDialogStub() {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal(): void;
    close(): void;
  };
  if (typeof proto.showModal === 'function') return;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

export function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <p data-testid="location" data-navigation={type}>
      {location.pathname + location.search + location.hash}
    </p>
  );
}

export function renderAdminApp(path: string) {
  // Cung cau hinh mac dinh voi core/queryClient (retry 1): de kiem chinh sach retry rieng cua admin.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, retryDelay: 0, refetchOnWindowFocus: false, staleTime: 30_000 },
    },
  });
  const holder: { auth?: ReturnType<typeof useAuth> } = {};
  function AuthProbe() {
    const auth = useAuth();
    useEffect(() => {
      holder.auth = auth;
    }, [auth]);
    return null;
  }
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProbe />
          <LocationProbe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  const auth = () => {
    if (!holder.auth) throw new Error('AuthProvider chua san sang');
    return holder.auth;
  };
  return { ...result, queryClient, auth };
}
