import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { profileKeys } from './api/profile-address.api.js';
import { AuthProvider, useAuth } from './AuthProvider.js';

/*
 * Regression cho Issue #43. Moi bai KIEM SOAT thu tu bang cong (gate) va khoa gia, khong dua vao
 * chay dong thoi nhieu vong. Ma UC-01.4 la ma DE XUAT o PR #26 (chua gop, chua duyet); tieu chi
 * nam o docs/features/auth/session-lifecycle.md. Neu danh muc chot ma khac thi doi ten theo.
 */

type Auth = ReturnType<typeof useAuth>;
type AuthUser = Auth['user'] & object;

interface Deferred<T = void> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const userA: AuthUser = { id: 'user-a', email: 'a@example.com', roles: ['CUSTOMER'] };
const userB: AuthUser = { id: 'user-b', email: 'b@example.com', roles: ['CUSTOMER'] };
const usersByEmail: Record<string, AuthUser> = { [userA.email]: userA, [userB.email]: userB };
const usersById: Record<string, AuthUser> = { [userA.id]: userA, [userB.id]: userB };

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

interface Call {
  path: string;
  cookie: string | null;
  bearer: string;
  signal: AbortSignal | null | undefined;
}

interface Session {
  userId: string;
  family: string;
  active: boolean;
}

/**
 * May chu gia voi cookie jar CHUNG cua trinh duyet. Giong may chu that: ket qua (xoay, thu hoi) duoc
 * tinh NGAY khi request toi; cong chi tre viec phan hoi ve trinh duyet, va Set-Cookie chi co hieu luc
 * khi phan hoi ve. Logout thu hoi ca family cua cookie duoc gui (hanh vi may chu sau ban sua).
 */
function createBackend() {
  const state = {
    cookie: null as string | null,
    sessions: new Map<string, Session>(),
    access: new Map<string, string>(),
    calls: [] as Call[],
    gates: new Map<string, Deferred[]>(),
    serial: 0,
  };
  const issueRefresh = (userId: string, family: string) => {
    const token = `rt-${(state.serial += 1)}`;
    state.sessions.set(token, { userId, family, active: true });
    return token;
  };
  const issueAccess = (userId: string) => {
    const token = `at-${userId}-${(state.serial += 1)}`;
    state.access.set(token, userId);
    return token;
  };
  const endSessions = (match: (session: Session) => boolean) => {
    for (const session of state.sessions.values()) if (match(session)) session.active = false;
  };

  function handle(call: Call, body: unknown): { response: Response; setCookie?: string | null } {
    switch (call.path) {
      case '/auth/login': {
        const user = usersByEmail[(body as { email: string }).email]!;
        const cookie = issueRefresh(user.id, `family-${(state.serial += 1)}`);
        return { response: reply({ accessToken: issueAccess(user.id), user }), setCookie: cookie };
      }
      case '/auth/refresh': {
        const session = call.cookie ? state.sessions.get(call.cookie) : undefined;
        if (!session?.active) return { response: unauthorized() };
        session.active = false;
        const cookie = issueRefresh(session.userId, session.family);
        return {
          response: reply({
            accessToken: issueAccess(session.userId),
            user: usersById[session.userId],
          }),
          setCookie: cookie,
        };
      }
      case '/auth/logout': {
        const session = call.cookie ? state.sessions.get(call.cookie) : undefined;
        if (session) endSessions((other) => other.family === session.family);
        return { response: reply(undefined, 204), setCookie: null };
      }
      case '/auth/change-password': {
        const userId = state.access.get(call.bearer);
        if (!userId) return { response: unauthorized() };
        endSessions((session) => session.userId === userId);
        return { response: reply(undefined, 204), setCookie: null };
      }
      default: {
        const userId = state.access.get(call.bearer);
        return { response: userId ? reply({ path: call.path, userId }) : unauthorized() };
      }
    }
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: RequestInit = {}) => {
      const call: Call = {
        path: pathOf(url),
        cookie: state.cookie,
        bearer: bearerOf(init),
        signal: init.signal,
      };
      state.calls.push(call);
      const outcome = handle(call, init.body ? JSON.parse(String(init.body)) : undefined);
      const gate = state.gates.get(call.path)?.shift();
      if (gate) await gate.promise;
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (outcome.setCookie !== undefined) state.cookie = outcome.setCookie;
      return outcome.response;
    }),
  );

  return {
    state,
    /** Phan hoi cua lan goi KE TIEP toi `path` bi giu lai cho toi khi goi resolve(). */
    hold(path: string): Deferred {
      const gate = deferred();
      state.gates.set(path, [...(state.gates.get(path) ?? []), gate]);
      return gate;
    },
    /** Dat cookie cua mot phien da co (nhu the da dang nhap tu truoc, hoac tu tab khac). */
    signIn(user: AuthUser) {
      state.cookie = issueRefresh(user.id, `family-${(state.serial += 1)}`);
      return state.cookie;
    },
    expireAccess() {
      state.access.clear();
    },
    callsTo: (path: string) => state.calls.filter((call) => call.path === path),
    activeSessions: (userId: string) =>
      [...state.sessions.values()].filter((session) => session.active && session.userId === userId),
  };
}

/** navigator.locks gia: mot hang doi FIFO chung cho moi "tab" trong mot bai. */
class FakeLocks {
  private tail: Promise<unknown> = Promise.resolve();
  request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
    const run = this.tail.then(() => callback());
    this.tail = run.catch(() => undefined);
    return run;
  }
  /** Mot tab khac giu khoa cho toi khi goi ham tra ve. */
  hold(): () => void {
    const gate = deferred();
    void this.request('auth', () => gate.promise);
    return () => gate.resolve();
  }
}

/** BroadcastChannel gia: giao tin bat dong bo cho moi kenh CUNG ten, tru chinh kenh gui. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  static sent: unknown[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    FakeChannel.sent.push(data);
    for (const other of FakeChannel.open) {
      if (other !== this && other.name === this.name) {
        queueMicrotask(() => other.onmessage?.({ data }));
      }
    }
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

function setLocks(locks: unknown) {
  if (locks === undefined) delete (navigator as { locks?: unknown }).locks;
  else Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

function mountTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const holder: { auth?: Auth } = {};
  function Capture() {
    holder.auth = useAuth();
    return null;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Capture />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient, auth: () => holder.auth! };
}

type Tab = ReturnType<typeof mountTab>;

async function ready(tab: Tab) {
  await waitFor(() => expect(tab.auth().isLoading).toBe(false));
}

const sessionChanged = { name: 'SessionChangedError' };
const password = { email: userB.email, password: 'Password123' };

let locks: FakeLocks;

describe('UC-01.4 Làm mới phiên và đăng xuất: kết quả đến muộn (#43)', () => {
  beforeEach(() => {
    localStorage.clear();
    locks = new FakeLocks();
    setLocks(locks);
    FakeChannel.open.clear();
    FakeChannel.sent = [];
    vi.stubGlobal('BroadcastChannel', FakeChannel);
  });

  afterEach(() => {
    setLocks(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('UC-01.4/AC4 refresh thành công đến sau khi đăng xuất không phục hồi phiên; đăng xuất mang cookie đã xoay', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);
    backend.expireAccess();

    const refreshGate = backend.hold('/auth/refresh');
    const request = tab.auth().authenticatedRequest('/p/data');
    await waitFor(() => expect(backend.callsTo('/auth/refresh')).toHaveLength(2));
    const loggingOut = tab.auth().logout();
    refreshGate.resolve();
    await loggingOut;

    await expect(request).rejects.toMatchObject(sessionChanged);
    await waitFor(() => expect(tab.auth().isAuthenticated).toBe(false));
    const [logoutCall] = backend.callsTo('/auth/logout');
    const rotatedCookie = [...backend.state.sessions.keys()].at(-1);
    expect(logoutCall?.cookie).toBe(rotatedCookie);
    expect(backend.activeSessions(userA.id)).toHaveLength(0);
  });

  it('UC-01.4/AC4 refresh khởi động thất bại đến sau khi bắt đầu đăng nhập không xóa phiên mới', async () => {
    const backend = createBackend();
    backend.state.cookie = 'rt-unknown';
    const refreshGate = backend.hold('/auth/refresh');
    const tab = mountTab();
    await waitFor(() => expect(backend.callsTo('/auth/refresh')).toHaveLength(1));

    const loggingIn = tab.auth().login(password);
    refreshGate.resolve();
    await loggingIn;
    await ready(tab);

    await waitFor(() => expect(tab.auth().user?.id).toBe(userB.id));
    expect(backend.activeSessions(userB.id)).toHaveLength(1);
  });

  it('UC-01.4/AC4 đăng nhập đến muộn sau khi đã bấm đăng xuất bị bỏ, phiên vừa tạo bị thu hồi', async () => {
    const backend = createBackend();
    const tab = mountTab();
    await ready(tab);

    const loginGate = backend.hold('/auth/login');
    const loggingIn = tab.auth().login({ email: userA.email, password: 'Password123' });
    await waitFor(() => expect(backend.callsTo('/auth/login')).toHaveLength(1));
    const loggingOut = tab.auth().logout();
    loginGate.resolve();

    await expect(loggingIn).rejects.toMatchObject(sessionChanged);
    await loggingOut;
    await waitFor(() => expect(tab.auth().isAuthenticated).toBe(false));
    expect(backend.activeSessions(userA.id)).toHaveLength(0);
  });

  it('UC-01.4/AC6 request nhận 401 sau khi đã đổi sang tài khoản khác không được gửi lại bằng token mới', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);
    backend.expireAccess();

    const slowGate = backend.hold('/p/slow');
    const request = tab.auth().authenticatedRequest('/p/slow');
    await waitFor(() => expect(backend.callsTo('/p/slow')).toHaveLength(1));
    await tab.auth().logout();
    await tab.auth().login(password);
    slowGate.resolve();

    await expect(request).rejects.toMatchObject(sessionChanged);
    expect(backend.callsTo('/p/slow')).toHaveLength(1);
    await waitFor(() => expect(tab.auth().user?.id).toBe(userB.id));
  });

  it('UC-01.4/AC6 phản hồi thành công đến sau khi đổi phiên bị bỏ', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);

    const gate = backend.hold('/p/data');
    const request = tab.auth().authenticatedRequest('/p/data');
    await waitFor(() => expect(backend.callsTo('/p/data')).toHaveLength(1));
    await tab.auth().logout();
    gate.resolve();

    await expect(request).rejects.toMatchObject(sessionChanged);
  });

  it('UC-01.4/AC7 đổi phiên hủy request đang chờ và xóa cache tài khoản của phiên trước', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);
    tab.queryClient.setQueryData(profileKeys.current(userA.id), { id: userA.id });
    tab.queryClient.setQueryData(['unrelated'], { retained: true });

    const gate = backend.hold('/p/data');
    const request = tab.auth().authenticatedRequest('/p/data');
    await waitFor(() => expect(backend.callsTo('/p/data')).toHaveLength(1));
    await tab.auth().logout();

    expect(backend.callsTo('/p/data')[0]?.signal?.aborted).toBe(true);
    expect(tab.queryClient.getQueryData(profileKeys.current(userA.id))).toBeUndefined();
    expect(tab.queryClient.getQueryData(['unrelated'])).toEqual({ retained: true });
    gate.resolve();
    await expect(request).rejects.toMatchObject(sessionChanged);
  });

  it('UC-01.4/AC8 tab khác đăng xuất rồi đăng nhập tài khoản khác: tab đang dùng chỉ xóa trạng thái local', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const first = mountTab();
    const second = mountTab();
    await ready(first);
    await ready(second);

    await first.auth().logout();
    await first.auth().login(password);

    await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
    await waitFor(() => expect(second.auth().user).toBeNull());
    await waitFor(() => expect(first.auth().user?.id).toBe(userB.id));
    expect(backend.callsTo('/auth/logout')).toHaveLength(1);
    expect(backend.activeSessions(userB.id)).toHaveLength(1);
    // Tin giua cac tab va dau phien dung chung khong mang token hay thong tin tai khoan.
    expect(FakeChannel.sent.length).toBeGreaterThan(0);
    for (const message of FakeChannel.sent) expect(message).toEqual({ type: 'session-changed' });
    const stored = JSON.stringify({ ...localStorage });
    for (const secret of [userA.id, userB.id, userA.email, userB.email, 'rt-', 'at-']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('UC-01.4/AC8 refresh giữa phiên trả về người dùng khác thì không nhận, không gửi lại request', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);

    // Cookie doi ma dau phien khong doi (ban build cu, hay storage bi chan): chi con lop kiem userId.
    backend.signIn(userB);
    backend.expireAccess();
    const request = tab.auth().authenticatedRequest('/p/data');

    await expect(request).rejects.toMatchObject(sessionChanged);
    await waitFor(() => expect(tab.auth().isAuthenticated).toBe(false));
    expect(backend.callsTo('/p/data')).toHaveLength(1);
    expect(backend.callsTo('/auth/logout')).toHaveLength(0);
    expect(backend.activeSessions(userB.id)).toHaveLength(1);
  });

  it('UC-01.4/AC10 khôi phục phiên lúc tải trang nhận phiên của cookie hiện có', async () => {
    const backend = createBackend();
    backend.signIn(userB);
    const tab = mountTab();
    await ready(tab);

    await waitFor(() => expect(tab.auth().user?.id).toBe(userB.id));
  });

  it('UC-01.4/AC9 đăng xuất xếp sau refresh của tab khác và gửi cookie đã xoay', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const first = mountTab();
    const second = mountTab();
    await ready(first);
    await ready(second);
    backend.expireAccess();

    const refreshGate = backend.hold('/auth/refresh');
    const request = second.auth().authenticatedRequest('/p/data');
    await waitFor(() => expect(backend.callsTo('/auth/refresh')).toHaveLength(2));
    const loggingOut = first.auth().logout();
    expect(backend.callsTo('/auth/logout')).toHaveLength(0);
    refreshGate.resolve();
    await loggingOut;
    await request.catch(() => undefined);

    const rotatedCookie = [...backend.state.sessions.keys()].at(-1);
    expect(backend.callsTo('/auth/logout')[0]?.cookie).toBe(rotatedCookie);
    expect(backend.activeSessions(userA.id)).toHaveLength(0);
    await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
  });

  it('UC-01.4/AC9 tab đã bị tab khác thay phiên thì đăng xuất không thu hồi phiên mới', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const backend = createBackend();
    backend.signIn(userA);
    const first = mountTab();
    const second = mountTab();
    await ready(first);
    await ready(second);

    await first.auth().login(password);
    await second.auth().logout();

    await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
    expect(backend.callsTo('/auth/logout')).toHaveLength(0);
    await waitFor(() => expect(first.auth().user?.id).toBe(userB.id));
    expect(backend.activeSessions(userB.id)).toHaveLength(1);
  });

  it('UC-01.4/AC9 đổi mật khẩu không gửi khi tab khác đã đăng nhập phiên khác, không xóa cookie đó', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const backend = createBackend();
    backend.signIn(userA);
    const first = mountTab();
    const second = mountTab();
    await ready(first);
    await ready(second);

    await first.auth().login(password);
    const cookieOfB = backend.state.cookie;
    await expect(
      second.auth().changePassword('Password123', 'NewPassword123'),
    ).rejects.toMatchObject(sessionChanged);

    expect(backend.callsTo('/auth/change-password')).toHaveLength(0);
    expect(backend.state.cookie).toBe(cookieOfB);
    expect(backend.activeSessions(userB.id)).toHaveLength(1);
    await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
  });

  it('UC-01.4/AC9 đổi mật khẩu chờ khóa phiên do tab khác giữ rồi mới gửi', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);

    const release = locks.hold();
    const changing = tab.auth().changePassword('Password123', 'NewPassword123');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(backend.callsTo('/auth/change-password')).toHaveLength(0);
    release();
    await changing;

    expect(backend.callsTo('/auth/change-password')).toHaveLength(1);
    await waitFor(() => expect(tab.auth().isAuthenticated).toBe(false));
  });

  it('UC-01.4/AC9 đổi mật khẩu gặp 401 làm mới phiên ngoài khóa rồi gửi lại, không tự chờ chính mình', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);
    backend.expireAccess();

    await tab.auth().changePassword('Password123', 'NewPassword123');

    expect(backend.callsTo('/auth/change-password')).toHaveLength(2);
    expect(backend.callsTo('/auth/refresh')).toHaveLength(2);
    expect(backend.activeSessions(userA.id)).toHaveLength(0);
  });

  it('UC-01.4/AC9 refresh chờ khóa quá lâu, phiên đã kết thúc thì không gửi refresh nữa', async () => {
    const backend = createBackend();
    backend.signIn(userA);
    const tab = mountTab();
    await ready(tab);
    backend.expireAccess();

    const release = locks.hold();
    const request = tab.auth().authenticatedRequest('/p/data');
    await waitFor(() => expect(backend.callsTo('/p/data')).toHaveLength(1));
    const loggingOut = tab.auth().logout();
    release();
    await loggingOut;

    await expect(request).rejects.toMatchObject(sessionChanged);
    expect(backend.callsTo('/auth/refresh')).toHaveLength(1); // chi lan khoi dong
    expect(backend.activeSessions(userA.id)).toHaveLength(0);
  });

  describe('thông báo giữa các tab phân biệt sự kiện với phiên hiện tại (review Codex)', () => {
    /** Giu moi tin lai, tu giao bang tay de ep tin den muon. */
    function holdBroadcasts() {
      const pending: (() => void)[] = [];
      vi.spyOn(FakeChannel.prototype, 'postMessage').mockImplementation(function (
        this: FakeChannel,
        data: unknown,
      ) {
        FakeChannel.sent.push(data);
        for (const other of FakeChannel.open) {
          if (other !== this && other.name === this.name) {
            pending.push(() => other.onmessage?.({ data }));
          }
        }
      });
      return pending;
    }

    it('UC-01.4/AC8 thông báo đến muộn của lần đăng nhập trước không xóa phiên mới hơn của tab nhận', async () => {
      const backend = createBackend();
      backend.signIn(userA);
      const first = mountTab();
      const second = mountTab();
      await ready(first);
      await ready(second);
      const pending = holdBroadcasts();

      await first.auth().login({ email: userA.email, password: 'Password123' });
      await second.auth().login(password);
      await waitFor(() => expect(second.auth().user?.id).toBe(userB.id));
      // Tin cua lan dang nhap o tab dau, xay ra TRUOC khi tab sau dang nhap, gio moi toi.
      await act(async () => {
        pending[0]?.();
      });

      expect(second.auth().user?.id).toBe(userB.id);
      expect(backend.activeSessions(userB.id)).toHaveLength(1);
    });

    it('UC-01.4/AC8 đăng xuất lỗi mạng vẫn báo các tab khác xóa trạng thái local', async () => {
      const backend = createBackend();
      backend.signIn(userA);
      const first = mountTab();
      const second = mountTab();
      await ready(first);
      await ready(second);
      const reachBackend = globalThis.fetch;
      vi.stubGlobal(
        'fetch',
        vi.fn((url: unknown, init?: RequestInit) =>
          pathOf(url) === '/auth/logout'
            ? Promise.reject(new TypeError('Network unavailable'))
            : reachBackend(url as RequestInfo, init),
        ),
      );

      await act(async () => {
        await first.auth().logout();
      });

      await waitFor(() => expect(first.auth().isAuthenticated).toBe(false));
      await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
    });

    it('UC-01.4/AC8 tab đã bị thay phiên đăng xuất thì không báo, không xóa phiên mới ở tab khác', async () => {
      const backend = createBackend();
      backend.signIn(userA);
      const first = mountTab();
      const second = mountTab();
      await ready(first);
      await ready(second);
      const pending = holdBroadcasts();

      await first.auth().login(password);
      const sentBefore = FakeChannel.sent.length;
      await act(async () => {
        await second.auth().logout();
      });
      await act(async () => {
        for (const deliver of pending.splice(0)) deliver();
      });

      expect(FakeChannel.sent).toHaveLength(sentBefore);
      expect(backend.callsTo('/auth/logout')).toHaveLength(0);
      expect(first.auth().user?.id).toBe(userB.id);
      expect(backend.activeSessions(userB.id)).toHaveLength(1);
    });

    it('UC-01.4/AC8 không đọc được dấu phiên thì thông báo vẫn xóa trạng thái local, không giữ phiên có thể đã hết', async () => {
      const backend = createBackend();
      backend.signIn(userA);
      const first = mountTab();
      const second = mountTab();
      await ready(first);
      await ready(second);
      const readItem = Storage.prototype.getItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
        if (key === 'fashion-shop:auth-session') throw new Error('storage blocked');
        return readItem.call(this, key);
      });

      await act(async () => {
        await first.auth().logout();
      });

      await waitFor(() => expect(second.auth().isAuthenticated).toBe(false));
      expect(backend.callsTo('/auth/logout')).toHaveLength(1);
    });
  });
});
