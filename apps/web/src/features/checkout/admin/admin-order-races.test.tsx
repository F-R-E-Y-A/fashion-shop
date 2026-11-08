import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionQueryKeys } from '@/core';

import { adminOrderKeys } from './admin-orders.api.js';
import { base } from './test-support/order-fixture.js';
import {
  actor,
  createBackend,
  deferred,
  denied,
  installDialogStub,
  mount,
  orderPage,
  otherActor,
  reply,
} from './test-support/session-harness.js';

beforeAll(installDialogStub);
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const pendingOrder = {
  ...base,
  status: 'PROCESSING',
  actions: { ...base.actions, markDelivered: true },
};
async function confirmDelivered() {
  fireEvent.click(await screen.findByRole('button', { name: 'Đã giao' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Đã giao' }));
  return dialog;
}
const cachedAdminData = (client: ReturnType<typeof mount>['client']) =>
  client
    .getQueriesData({ queryKey: sessionQueryKeys.admin })
    .filter(([, data]) => data !== undefined);

describe('UC-02.1/AC6, AC8 — hồi quy bảo vệ dùng chung cho đơn hàng (#57)', () => {
  it.each([
    { path: '/admin/orders/o1', open: 'Đã giao', confirm: 'Đã giao', status: 'ACTIVE' },
    {
      path: '/admin/users/u1',
      open: 'Khóa tài khoản',
      confirm: 'Khóa tài khoản',
      status: 'ACTIVE',
    },
    { path: '/admin/users/u1', open: 'Mở khóa tài khoản', confirm: 'Mở khóa', status: 'LOCKED' },
  ])(
    'UC-01.4/AC6 POST $confirm bị hoãn khi offline không dùng danh tính mới lúc chạy lại',
    async ({ path, open, confirm, status }) => {
      const backend = createBackend();
      backend.setOrder(pendingOrder);
      backend.override((request) =>
        request.path === '/admin/users/u1'
          ? reply({
              id: 'u1',
              email: base.customerEmail,
              status,
              roles: ['CUSTOMER'],
              emailVerifiedAt: null,
              createdAt: base.createdAt,
            })
          : undefined,
      );
      const { client, auth } = mount(path);
      fireEvent.click(await screen.findByRole('button', { name: open }));
      const dialog = await screen.findByRole('dialog');
      onlineManager.setOnline(false);
      fireEvent.click(within(dialog).getByRole('button', { name: confirm }));
      await waitFor(() =>
        expect(
          client
            .getMutationCache()
            .getAll()
            .some((mutation) => mutation.state.isPaused),
        ).toBe(true),
      );
      await act(async () => {
        await auth().login({ email: otherActor.email, password: 'Synthetic123' });
      });
      await act(async () => {
        onlineManager.setOnline(true);
        await client.resumePausedMutations();
      });
      await screen.findByRole('button', { name: open });
      expect(auth().user?.id).toBe(otherActor.id);
      expect(
        backend.calls.filter(
          (request) => request.method === 'POST' && request.path.startsWith('/admin/'),
        ),
      ).toHaveLength(0);
    },
  );

  it.each(['orders', 'users'])(
    'đăng nhập lại cùng actor không giữ placeholder %s của phiên cũ',
    async (resource) => {
      const backend = createBackend();
      const next = deferred<Response>();
      let reads = 0;
      const data =
        resource === 'orders'
          ? orderPage()
          : {
              items: [
                {
                  id: 'u1',
                  email: base.customerEmail,
                  status: 'ACTIVE',
                  roles: ['CUSTOMER'],
                  emailVerifiedAt: null,
                  createdAt: base.createdAt,
                },
              ],
              total: 1,
              page: 1,
              pageSize: 20,
              totalPages: 1,
            };
      backend.override((request) => {
        if (!request.path.startsWith(`/admin/${resource}?`)) return undefined;
        reads += 1;
        return reads === 1 ? reply(data) : next.promise;
      });
      const { auth } = mount(`/admin/${resource}`);
      await screen.findByText(base.customerEmail);
      await act(async () => {
        await auth().login({ email: actor.email, password: 'Synthetic123' });
      });
      await waitFor(() => expect(reads).toBe(2));
      expect(screen.queryByText(base.customerEmail)).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      await act(async () => {
        next.resolve(reply(data));
      });
      expect(await screen.findByText(base.customerEmail)).toBeInTheDocument();
    },
  );

  it.each(['detail', 'list'] as const)(
    'GET %s 403 thắng POST thành công đến muộn trong cùng batch',
    async (source) => {
      const backend = createBackend();
      backend.setOrder(pendingOrder);
      const post = deferred<Response>();
      let forbid = false;
      backend.override((request) =>
        request.method === 'POST' && request.path.startsWith('/admin/')
          ? post.promise
          : forbid
            ? denied()
            : undefined,
      );
      const { client, auth } = mount();
      const dialog = await confirmDelivered();
      await waitFor(() =>
        expect(
          backend.calls.filter(
            (request) => request.method === 'POST' && request.path.startsWith('/admin/'),
          ),
        ).toHaveLength(1),
      );
      fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
      if (source === 'list') {
        fireEvent.click(screen.getByRole('link', { name: '← Danh sách đơn' }));
        await screen.findByRole('link', { name: base.orderCode });
      }
      await act(async () => {
        forbid = true;
        await client.invalidateQueries({ queryKey: adminOrderKeys.all(actor.id) });
        post.resolve(reply(base));
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
      expect(cachedAdminData(client)).toEqual([]);
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
      expect(screen.queryByText(base.customerEmail)).not.toBeInTheDocument();
      expect(screen.queryByText('Đã ghi nhận giao hàng.')).not.toBeInTheDocument();
      expect(auth().user?.id).toBe(actor.id);
      expect(backend.calls.some((request) => request.path === '/auth/logout')).toBe(false);
    },
  );

  it('UC-12.1/AC5 403 dọn cache admin cùng actor, hủy GET khác và chặn màn users sau điều hướng', async () => {
    const backend = createBackend();
    const { client } = mount();
    await screen.findByText(base.customerEmail);
    const otherKey = adminOrderKeys.detail(otherActor.id, 'other');
    client.setQueryData(otherKey, { unrelatedActor: true });
    client.setQueryData([...sessionQueryKeys.adminResource('users'), actor.id, 'list'], {
      private: true,
    });
    client.setQueryData([...sessionQueryKeys.scope('profile'), actor.id], { ownProfile: true });
    const sibling = deferred<unknown>();
    let siblingSignal: AbortSignal | undefined;
    const siblingKey = [...sessionQueryKeys.adminResource('future-resource'), actor.id, 'read'];
    const siblingRequest = client
      .fetchQuery({
        queryKey: siblingKey,
        queryFn: ({ signal }) => {
          siblingSignal = signal;
          return sibling.promise;
        },
      })
      .catch(() => undefined);
    backend.override(() => denied());
    await act(async () => {
      await client.invalidateQueries({ queryKey: adminOrderKeys.all(actor.id) });
    });
    expect(siblingSignal?.aborted).toBe(true);
    expect(client.getQueryData(otherKey)).toEqual({ unrelatedActor: true });
    expect(client.getQueryData([...sessionQueryKeys.scope('profile'), actor.id])).toEqual({
      ownProfile: true,
    });
    fireEvent.click(screen.getByRole('link', { name: 'Mở người dùng' }));
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    expect(backend.calls.filter((request) => request.path.startsWith('/admin/users'))).toHaveLength(
      0,
    );
    await act(async () => {
      sibling.resolve({ late: true });
      await siblingRequest;
    });
    expect(client.getQueryData(siblingKey)).toBeUndefined();
  });

  it.each([actor, otherActor])(
    'POST phiên cũ không sửa cache/notice khi đăng nhập lại $id',
    async (nextActor) => {
      const backend = createBackend();
      backend.setOrder(pendingOrder);
      const post = deferred<Response>();
      backend.override((request) =>
        request.method === 'POST' && request.path.startsWith('/admin/') ? post.promise : undefined,
      );
      const { client, auth } = mount();
      await confirmDelivered();
      await waitFor(() => expect(client.isMutating()).toBe(1));
      await act(async () => {
        await auth().login({ email: nextActor.email, password: 'Synthetic123' });
      });
      await screen.findByRole('button', { name: 'Đã giao' });
      await act(async () => {
        post.resolve(reply(base));
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
      expect(screen.queryByText('Đã ghi nhận giao hàng.')).not.toBeInTheDocument();
      expect(client.getQueryData(adminOrderKeys.detail(nextActor.id, base.id))).toMatchObject({
        status: 'PROCESSING',
      });
      if (nextActor.id !== actor.id)
        expect(client.getQueryData(adminOrderKeys.detail(actor.id, base.id))).toBeUndefined();
      expect(
        backend.calls.find(
          (request) => request.method === 'POST' && request.path.startsWith('/admin/'),
        )?.signal?.aborted,
      ).toBe(true);
    },
  );

  it('UC-12.1/AC5 GET cũ không ghi đè trạng thái sau POST thành công, dù fetch bỏ qua abort', async () => {
    const backend = createBackend();
    backend.setOrder(pendingOrder);
    const stale = deferred<Response>();
    let oldGet = true;
    backend.override((request) => {
      if (request.method === 'POST' && request.path.startsWith('/admin/')) {
        backend.setOrder(base);
        return reply(base);
      }
      if (oldGet && backend.calls.filter((call) => call.path === '/admin/orders/o1').length === 2) {
        oldGet = false;
        return stale.promise;
      }
      return undefined;
    });
    const { client } = mount();
    await screen.findByText(base.customerEmail);
    act(() => {
      void client.invalidateQueries({ queryKey: adminOrderKeys.all(actor.id) });
    });
    await waitFor(() =>
      expect(backend.calls.filter((call) => call.path === '/admin/orders/o1')).toHaveLength(2),
    );
    await confirmDelivered();
    await screen.findByText('Đã ghi nhận giao hàng.');
    expect(
      backend.calls.filter((call) => call.path === '/admin/orders/o1')[1]?.signal?.aborted,
    ).toBe(true);
    await act(async () => {
      stale.resolve(reply(pendingOrder));
    });
    expect(client.getQueryData(adminOrderKeys.detail(actor.id, base.id))).toMatchObject({
      status: 'DELIVERED',
    });
    expect(screen.queryByRole('button', { name: 'Đã giao' })).not.toBeInTheDocument();
  });

  it('UC-12.1/AC5 GET 403 của phiên cũ không thu hồi quyền của phiên mới', async () => {
    const backend = createBackend();
    const old = deferred<Response>();
    backend.override(() =>
      backend.calls.filter((call) => call.path === '/admin/orders/o1').length === 1
        ? old.promise
        : undefined,
    );
    const { client, auth } = mount();
    await waitFor(() =>
      expect(backend.calls.filter((call) => call.path === '/admin/orders/o1')).toHaveLength(1),
    );
    await act(async () => {
      await auth().login({ email: otherActor.email, password: 'Synthetic123' });
    });
    await screen.findByText(base.customerEmail);
    await act(async () => {
      old.resolve(denied());
    });
    expect(
      screen.queryByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).not.toBeInTheDocument();
    expect(client.getQueryData(adminOrderKeys.detail(otherActor.id, base.id))).toBeDefined();
  });

  it('403 không khóa vĩnh viễn actor: đăng nhập lại cùng actor mở phiên mới', async () => {
    const backend = createBackend();
    backend.override(() => denied());
    const { auth } = mount();
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    backend.override(undefined);
    await act(async () => {
      await auth().login({ email: actor.email, password: 'Synthetic123' });
    });
    expect(await screen.findByText(base.customerEmail)).toBeInTheDocument();
  });

  it.each([400, 403, 404, 409, 422])(
    'GET %s không tự retry dù QueryClient mặc định cho retry',
    async (status) => {
      const backend = createBackend();
      backend.override(() => denied(status));
      const { client } = mount();
      await waitFor(() => expect(client.isFetching()).toBe(0));
      await screen.findByText(
        status === 403
          ? 'Không đủ quyền truy cập'
          : status === 400 || status === 404
            ? 'Không tìm thấy đơn hàng này.'
            : /Từ chối/,
      );
      expect(backend.calls.filter((call) => call.path === '/admin/orders/o1')).toHaveLength(1);
    },
  );

  it('UC-12.1/AC11 xác nhận liên tiếp chỉ gửi một POST', async () => {
    const backend = createBackend();
    backend.setOrder(pendingOrder);
    const post = deferred<Response>();
    backend.override((request) =>
      request.method === 'POST' && request.path.startsWith('/admin/') ? post.promise : undefined,
    );
    const { client } = mount();
    const dialog = await confirmDelivered();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Đang xử lý…' }));
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(
      backend.calls.filter((call) => call.method === 'POST' && call.path.startsWith('/admin/')),
    ).toHaveLength(1);
    await act(async () => {
      post.resolve(reply(base));
    });
  });

  it('POST 403 đóng hộp, dọn cache và giữ phiên cửa hàng', async () => {
    const backend = createBackend();
    backend.setOrder(pendingOrder);
    backend.override((request) =>
      request.method === 'POST' && request.path.startsWith('/admin/') ? denied() : undefined,
    );
    const { client, auth } = mount();
    await confirmDelivered();
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(cachedAdminData(client)).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(auth().user?.id).toBe(actor.id);
  });

  it('UC-12.1/AC11 timeout POST không gửi lại; GET lỗi thì chặn thao tác tới khi kiểm lại thành công', async () => {
    const backend = createBackend();
    backend.setOrder(pendingOrder);
    let readFails = false;
    backend.override((request) => {
      if (request.method === 'POST' && request.path.startsWith('/admin/')) {
        readFails = true;
        return new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason), {
            once: true,
          });
        });
      }
      if (readFails) return denied(503);
      return undefined;
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Đã giao' }));
    const dialog = await screen.findByRole('dialog');
    vi.useFakeTimers();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đã giao' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_100);
    });
    vi.useRealTimers();
    await screen.findByRole('button', { name: 'Kiểm tra lại trạng thái' });
    expect(screen.getByRole('button', { name: 'Đã giao' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('alert')
        .some((element) => element.textContent?.includes('Chưa xác định được kết quả')),
    ).toBe(true);
    expect(
      backend.calls.filter((call) => call.method === 'POST' && call.path.startsWith('/admin/')),
    ).toHaveLength(1);
    readFails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đã giao' })).toBeEnabled());
    expect(
      backend.calls.filter((call) => call.method === 'POST' && call.path.startsWith('/admin/')),
    ).toHaveLength(1);
  });
});
import { onlineManager } from '@tanstack/react-query';
