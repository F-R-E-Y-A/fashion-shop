import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/core';

import { AuthProvider, useAuth } from './AuthProvider.js';

type Auth = ReturnType<typeof useAuth>;

/** jsdom khong co navigator.locks; dat/go tren chinh doi tuong navigator thay vi thay ca navigator. */
function setLocks(locks: unknown) {
  if (locks === undefined) delete (navigator as { locks?: unknown }).locks;
  else Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

const user = { id: 'user-1', email: 'customer@example.com', roles: ['CUSTOMER'] };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function reply(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const unauthorized = () =>
  reply({ statusCode: 401, code: 'UNAUTHORIZED', message: 'x', path: '/', timestamp: 'now' }, 401);

const pathOf = (url: unknown) => String(url).replace(/^.*\/api/, '');
const bearerOf = (init?: RequestInit) =>
  String((init?.headers as Record<string, string> | undefined)?.Authorization ?? '').replace(
    'Bearer ',
    '',
  );

/**
 * Backend gia lap co DUNG hanh vi rotate + replay: moi refresh doi cookie sang token moi; gui lai token
 * cu la replay va thu hoi ca family (moi refresh sau do deu 401). `cookie` la cookie jar CHUNG cua trinh
 * duyet, doc luc fetch duoc GOI (giong trinh duyet), khong phai luc phan hoi ve.
 */
function installBackend(options: { refreshDelayMs?: number; failRefreshAfter?: number } = {}) {
  const state = {
    cookie: 'refresh-0',
    latest: 'refresh-0',
    revoked: false,
    refreshCalls: 0,
    protectedCalls: [] as string[],
    accessSerial: 0,
    validAccess: new Set<string>(),
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const path = pathOf(url);

      if (path === '/auth/refresh') {
        state.refreshCalls += 1;
        const sentCookie = state.cookie; // cookie duoc gui ngay luc goi
        await sleep(options.refreshDelayMs ?? 15);
        const failing =
          options.failRefreshAfter !== undefined && state.refreshCalls > options.failRefreshAfter;
        if (state.revoked || failing) return unauthorized();
        if (sentCookie !== state.latest) {
          state.revoked = true; // replay => ca family bi thu hoi
          return unauthorized();
        }
        state.latest = `refresh-${state.refreshCalls}`;
        state.cookie = state.latest;
        const accessToken = `access-${(state.accessSerial += 1)}`;
        state.validAccess.clear();
        state.validAccess.add(accessToken);
        return reply({ accessToken, user });
      }

      state.protectedCalls.push(`${path}@${bearerOf(init)}`);
      if (path === '/always-401') return unauthorized();
      if (path === '/slow') await sleep(80);
      return state.validAccess.has(bearerOf(init)) ? reply({ path }) : unauthorized();
    }),
  );
  return state;
}

function mount(strict = false) {
  const holder: { auth?: Auth } = {};
  function Capture() {
    holder.auth = useAuth();
    return null;
  }
  const tree = (
    <AuthProvider>
      <Capture />
    </AuthProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { holder, view, auth: () => holder.auth! };
}

async function ready(app: ReturnType<typeof mount>) {
  await waitFor(() => expect(app.auth().isLoading).toBe(false));
}

describe('AuthProvider refresh is single-flight (no self-inflicted replay)', () => {
  beforeEach(() => {
    setLocks(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs exactly one bootstrap refresh even though StrictMode mounts the effect twice', async () => {
    const backend = installBackend();

    const app = mount(true);
    await ready(app);

    expect(backend.refreshCalls).toBe(1);
    expect(app.auth().isAuthenticated).toBe(true);
  });

  it('two requests that both get 401 share ONE refresh and both retry with the new token', async () => {
    const backend = installBackend();
    const app = mount();
    await ready(app);
    backend.validAccess.clear(); // the access token expires server-side
    const before = backend.refreshCalls;

    // Register the new token in the backend only when the refresh call runs.
    const [a, b] = await Promise.all([
      app.auth().authenticatedRequest<{ path: string }>('/p/a'),
      app.auth().authenticatedRequest<{ path: string }>('/p/b'),
    ]);

    expect(a).toEqual({ path: '/p/a' });
    expect(b).toEqual({ path: '/p/b' });
    expect(backend.refreshCalls - before).toBe(1);
    expect(backend.revoked).toBe(false);
    const retries = backend.protectedCalls.filter((call) => call.endsWith('@access-2'));
    expect(retries).toHaveLength(2); // both retried with the refreshed token
  });

  it('twenty simultaneous 401s still cause a single refresh (no queue, no stampede)', async () => {
    const backend = installBackend();
    const app = mount();
    await ready(app);
    backend.validAccess.clear();
    const before = backend.refreshCalls;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => app.auth().authenticatedRequest(`/p/${i}`)),
    );

    expect(results).toHaveLength(20);
    expect(backend.refreshCalls - before).toBe(1);
    expect(backend.revoked).toBe(false);
  });

  it('when the refresh fails every waiter fails once, nobody retries, and auth is cleared', async () => {
    const backend = installBackend({ failRefreshAfter: 1 }); // bootstrap ok, next refresh 401
    const app = mount();
    await ready(app);
    backend.validAccess.clear();
    const callsBefore = backend.protectedCalls.length;

    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => app.auth().authenticatedRequest(`/p/${i}`)),
    );

    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
    for (const outcome of outcomes) {
      const reason = (outcome as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ApiError);
      expect((reason as ApiError).body.statusCode).toBe(401);
    }
    expect(backend.refreshCalls).toBe(2); // bootstrap + exactly one failed attempt
    expect(backend.protectedCalls.length - callsBefore).toBe(5); // 5 originals, zero retries
    await waitFor(() => expect(app.auth().isAuthenticated).toBe(false));
    expect(app.auth().accessToken).toBeNull();
    // Further calls fail locally without touching the network.
    const fetchCalls = vi.mocked(fetch).mock.calls.length;
    await expect(app.auth().authenticatedRequest('/p/late')).rejects.toThrow();
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCalls);
  });

  it('a retry that is 401 again is reported, never refreshed a second time', async () => {
    const backend = installBackend();
    const app = mount();
    await ready(app);
    const before = backend.refreshCalls;

    await expect(app.auth().authenticatedRequest('/always-401')).rejects.toBeInstanceOf(ApiError);

    expect(backend.refreshCalls - before).toBe(1);
    expect(backend.protectedCalls.filter((c) => c.startsWith('/always-401'))).toHaveLength(2);
  });

  it('a 401 that arrives AFTER another request already refreshed reuses that token instead of rotating again', async () => {
    const backend = installBackend();
    const app = mount();
    await ready(app);
    backend.validAccess.clear();
    const before = backend.refreshCalls;

    // /slow was sent with the old token and answers 401 only after /fast has finished refreshing.
    const [slow, fast] = await Promise.all([
      app.auth().authenticatedRequest('/slow'),
      app.auth().authenticatedRequest('/fast'),
    ]);

    expect(slow).toEqual({ path: '/slow' });
    expect(fast).toEqual({ path: '/fast' });
    expect(backend.refreshCalls - before).toBe(1); // not 2
    expect(backend.revoked).toBe(false);
  });

  it('a late 401 after a FAILED refresh does not start yet another refresh', async () => {
    const backend = installBackend({ failRefreshAfter: 1 });
    const app = mount();
    await ready(app);
    backend.validAccess.clear();

    const outcomes = await Promise.allSettled([
      app.auth().authenticatedRequest('/slow'),
      app.auth().authenticatedRequest('/fast'),
    ]);

    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
    expect(backend.refreshCalls).toBe(2);
  });
});

describe('cross-tab refresh (Web Locks)', () => {
  /** Minimal navigator.locks: one FIFO queue shared by every "tab" in this test. */
  class FakeLocks {
    private tail: Promise<unknown> = Promise.resolve();
    requests = 0;
    request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
      this.requests += 1;
      const run = this.tail.then(() => callback());
      this.tail = run.catch(() => undefined);
      return run;
    }
  }

  afterEach(() => {
    setLocks(undefined);
    vi.unstubAllGlobals();
  });

  it('CONTROL: without the lock, two tabs restoring at once replay each other and lose the session', async () => {
    setLocks(undefined);
    const backend = installBackend({ refreshDelayMs: 30 });

    const tabA = mount();
    const tabB = mount();
    await ready(tabA);
    await ready(tabB);

    // Both sent refresh-0 before either response landed: the loser is a replay, the family dies.
    expect(backend.revoked).toBe(true);
    expect([tabA.auth().isAuthenticated, tabB.auth().isAuthenticated]).toContain(false);
  });

  it('with the lock, two tabs restoring at once are serialized: no replay, both stay signed in', async () => {
    const locks = new FakeLocks();
    setLocks(locks);
    const backend = installBackend({ refreshDelayMs: 30 });

    const tabA = mount();
    const tabB = mount();
    await ready(tabA);
    await ready(tabB);

    expect(locks.requests).toBe(2);
    expect(backend.revoked).toBe(false);
    expect(backend.refreshCalls).toBe(2);
    expect(tabA.auth().isAuthenticated).toBe(true);
    expect(tabB.auth().isAuthenticated).toBe(true);
  });
});
