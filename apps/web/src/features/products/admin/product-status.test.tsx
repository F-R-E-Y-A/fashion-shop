import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionQueryKeys } from '@/core';

import { adminCatalogKeys } from './admin-catalog.api.js';
import {
  actorA,
  actorB,
  backend,
  deferred,
  failure,
  mountCatalog,
  product,
  reply,
} from './catalog-test-support.js';
import { PRODUCT_ACTION_TIMEOUT_MS } from './product-status-action.js';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
const detailPath = `/admin/products/${product.id}`;
const statusPath = `/api/admin/products/${product.id}/status`;
const detailApi = `/api/admin/products/${product.id}`;
async function open(disabled: boolean) {
  fireEvent.click(
    await screen.findByRole('button', { name: disabled ? 'Gỡ ngừng bán' : 'Ngừng bán' }),
  );
  return screen.findByRole('dialog');
}
function confirm(dialog: HTMLElement, disabled: boolean) {
  fireEvent.click(
    within(dialog).getByRole('button', { name: disabled ? 'Gỡ ngừng bán' : 'Ngừng bán' }),
  );
}

describe('UC-04.2 trang thai products va cache', () => {
  it('UC-04.2/AC18 ket qua chua ro qua dieu huong van can GET doi chieu', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) => (r.method === 'PATCH' ? gate.promise : undefined);
    const view = mountCatalog(detailPath);
    confirm(await open(false), false);
    await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));
    act(() => view.go('/admin/products'));
    await screen.findByRole('link', { name: product.name });
    await act(async () => gate.resolve(failure(500)));
    expect(
      await screen.findByRole('button', { name: 'Kiểm tra lại trạng thái' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ngừng bán' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
    await screen.findByText(/Đã đối chiếu trạng thái hiện tại/);
    expect(screen.getByRole('button', { name: 'Ngừng bán' })).not.toBeDisabled();
  });
  it('UC-04.2/AC18 conflict tai lai truoc lan xac nhan moi', async () => {
    const api = backend();
    mountCatalog(detailPath);
    const dialog = await open(false);
    api.state.products = [{ ...product, adminDisabled: true, statusVersion: 1 }];
    confirm(dialog, false);
    await screen.findByText(/Trạng thái đã thay đổi/);
    confirm(await open(true), true);
    await screen.findByText(/Đã gỡ ngừng bán thủ công\./);
    expect(api.requests.filter((r) => r.method === 'PATCH').map((r) => r.body)).toEqual([
      { adminDisabled: true, expectedVersion: 0 },
      { adminDisabled: false, expectedVersion: 1 },
    ]);
  });
  it('UC-04.2/AC18 PATCH403 xoa du lieu va khong gui them', async () => {
    const api = backend();
    api.state.override = (r) => (r.method === 'PATCH' ? failure(403) : undefined);
    const view = mountCatalog(detailPath);
    confirm(await open(false), false);
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
  });
  it('UC-04.2/AC18 PATCH401 va refresh401 ket thuc phien, khong retry mutation', async () => {
    const api = backend();
    mountCatalog(detailPath);
    const dialog = await open(false);
    api.state.override = (r) =>
      r.method === 'PATCH' || r.path === '/api/auth/refresh' ? failure(401) : undefined;
    confirm(dialog, false);
    await screen.findByRole('heading', { name: 'Đăng nhập' });
    expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
  });
  it.each(['network', 'timeout'])(
    'UC-04.2/AC18 %s chi GET doi chieu; GET loi van chan thao tac moi',
    async (kind) => {
      const api = backend();
      api.state.override = (r) => {
        if (r.method !== 'PATCH') return undefined;
        return kind === 'network'
          ? Promise.reject(new TypeError('Synthetic offline'))
          : new Promise<Response>((_resolve, reject) =>
              r.signal?.addEventListener('abort', () => reject(r.signal?.reason), { once: true }),
            );
      };
      mountCatalog(detailPath);
      const dialog = await open(false);
      if (kind === 'timeout') vi.useFakeTimers();
      confirm(dialog, false);
      if (kind === 'timeout') {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(PRODUCT_ACTION_TIMEOUT_MS + 1);
        });
        vi.useRealTimers();
      }
      await screen.findByRole('button', { name: 'Kiểm tra lại trạng thái' });
      api.state.override = (r) => (r.path === detailApi ? failure(500) : undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
      await screen.findByText('Chưa đối chiếu được trạng thái. Kiểm tra kết nối rồi thử lại.');
      expect(screen.queryByRole('button', { name: 'Ngừng bán' })).not.toBeInTheDocument();
      api.state.override = undefined;
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
      await screen.findByText(/Đã đối chiếu trạng thái hiện tại/);
      expect(screen.getByRole('button', { name: 'Ngừng bán' })).not.toBeDisabled();
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
    },
  );
  it.each([false, true])(
    'UC-04.2/AC15 hai huong hold=%s, explicit/version/double click/pending/focus',
    async (disabled) => {
      const api = backend();
      api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
      const gate = deferred<Response>();
      api.state.override = (r) => (r.path === statusPath ? gate.promise : undefined);
      mountCatalog(detailPath);
      const dialog = await open(disabled);
      expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
      const button = within(dialog).getByRole('button', {
        name: disabled ? 'Gỡ ngừng bán' : 'Ngừng bán',
      });
      fireEvent.click(button);
      fireEvent.click(button);
      await waitFor(() => expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1));
      expect(api.requests.find((r) => r.method === 'PATCH')).toMatchObject({
        body: { adminDisabled: !disabled, expectedVersion: 0 },
      });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
      expect(await screen.findByText(/Đang xử lý yêu cầu/)).toBeInTheDocument();
      api.state.products = [
        { ...product, adminDisabled: !disabled, isActive: disabled, statusVersion: 1 },
      ];
      await act(async () => gate.resolve(reply(api.state.products[0])));
      await screen.findByRole('button', { name: disabled ? 'Ngừng bán' : 'Gỡ ngừng bán' });
    },
  );

  it.each([false, true])(
    'UC-04.2/AC16 GET cu sau mutation hold=%s bi huy, khong de trang thai',
    async (disabled) => {
      const api = backend();
      api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
      const view = mountCatalog(detailPath);
      const dialog = await open(disabled);
      const old = deferred<Response>();
      let late = true;
      api.state.override = (r) => (r.path === detailApi && late ? old.promise : undefined);
      let flight!: Promise<void>;
      act(() => {
        flight = view.client.refetchQueries({
          queryKey: adminCatalogKeys.detail(actorA.id, product.id),
        });
      });
      await waitFor(() => expect(api.requests.filter((r) => r.path === detailApi)).toHaveLength(2));
      const signal = api.requests.at(-1)?.signal;
      late = false;
      confirm(dialog, disabled);
      await screen.findByRole('button', { name: disabled ? 'Ngừng bán' : 'Gỡ ngừng bán' });
      expect(signal?.aborted).toBe(true);
      await act(async () => {
        old.resolve(reply({ ...product, adminDisabled: disabled }));
        await flight;
      });
      expect(
        view.client.getQueryData(adminCatalogKeys.detail(actorA.id, product.id)),
      ).toMatchObject({ adminDisabled: !disabled, statusVersion: 1 });
    },
  );

  it.each([false, true])(
    'UC-04.2/AC16 mutation version cu sau GET moi hold=%s',
    async (disabled) => {
      const api = backend();
      api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
      const gate = deferred<Response>();
      api.state.override = (r) => (r.path === statusPath ? gate.promise : undefined);
      const view = mountCatalog(detailPath);
      confirm(await open(disabled), disabled);
      await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));
      const latest = { ...product, adminDisabled: disabled, isActive: !disabled, statusVersion: 2 };
      api.state.products = [latest];
      await act(async () => {
        await view.client.refetchQueries({
          queryKey: adminCatalogKeys.detail(actorA.id, product.id),
        });
      });
      const versions: number[] = [];
      const unsubscribe = view.client.getQueryCache().subscribe(() => {
        const data = view.client.getQueryData<{ statusVersion: number }>(
          adminCatalogKeys.detail(actorA.id, product.id),
        );
        if (data) versions.push(data.statusVersion);
      });
      await act(async () =>
        gate.resolve(reply({ ...latest, adminDisabled: !disabled, statusVersion: 1 })),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      unsubscribe();
      expect(screen.getByText(/sản phẩm có thay đổi mới hơn/)).toBeInTheDocument();
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.every((v) => v === 2)).toBe(true);
    },
  );

  it.each([false, true])(
    'UC-04.2/AC16 GET403 truoc PATCH thanh cong muon hold=%s',
    async (disabled) => {
      const api = backend();
      api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
      const gate = deferred<Response>();
      api.state.override = (r) => (r.path === statusPath ? gate.promise : undefined);
      const view = mountCatalog(detailPath);
      confirm(await open(disabled), disabled);
      await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));
      api.state.override = (r) =>
        r.path === detailApi ? failure(403) : r.path === statusPath ? gate.promise : undefined;
      await act(async () => {
        await view.client.refetchQueries({
          queryKey: adminCatalogKeys.detail(actorA.id, product.id),
        });
      });
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
      const count = api.adminRequests().length;
      await act(async () =>
        gate.resolve(reply({ ...product, adminDisabled: !disabled, statusVersion: 1 })),
      );
      expect(
        view.client
          .getQueriesData({ queryKey: sessionQueryKeys.admin })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      expect(api.adminRequests()).toHaveLength(count);
      expect(screen.queryByText(/Đã ngừng bán thủ công\./)).not.toBeInTheDocument();
    },
  );

  it.each([false, true])(
    'UC-04.2/AC16 logout A→B/A→A khong invalidate phien moi, hold=%s',
    async (disabled) => {
      for (const actor of [actorA, actorB]) {
        const api = backend();
        api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
        const gate = deferred<Response>();
        api.state.override = (r) => (r.path === statusPath ? gate.promise : undefined);
        const view = mountCatalog(detailPath);
        confirm(await open(disabled), disabled);
        await waitFor(() => expect(api.requests.some((r) => r.method === 'PATCH')).toBe(true));
        await act(async () => {
          await view.auth().logout();
        });
        expect(api.requests.find((r) => r.method === 'PATCH')?.signal?.aborted).toBe(true);
        await act(async () => {
          await view.auth().login({ email: actor.email, password: 'Password123' });
          view.go(detailPath);
        });
        await screen.findByRole('heading', { name: product.name });
        const count = api.adminRequests().length;
        await act(async () =>
          gate.resolve(reply({ ...product, adminDisabled: !disabled, statusVersion: 1 })),
        );
        expect(api.adminRequests()).toHaveLength(count);
        expect(
          view.client.getQueryData(adminCatalogKeys.detail(actor.id, product.id)),
        ).toMatchObject({ adminDisabled: disabled, statusVersion: 0 });
        cleanup();
        localStorage.clear();
      }
    },
  );

  it.each([false, true])('UC-04.2/AC17 roi filter/total/trang cu, hold=%s', async (disabled) => {
    const api = backend();
    api.state.products = [{ ...product, adminDisabled: disabled, isActive: !disabled }];
    let writes = false;
    api.state.override = (r) => {
      if (r.method === 'PATCH') {
        writes = true;
        return undefined;
      }
      if (writes && r.path.startsWith('/api/admin/products?'))
        return reply({ items: [], total: 12, page: 2, pageSize: 12, totalPages: 1 });
      return undefined;
    };
    const path = `/admin/products?status=${disabled ? 'inactive' : 'active'}&page=2`;
    mountCatalog(path);
    confirm(await open(disabled), disabled);
    await screen.findByText('Trang 2 không còn sản phẩm.');
    expect(screen.queryByRole('link', { name: product.name })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(path);
    expect(screen.getByRole('link', { name: 'Về trang hợp lệ' })).toHaveAttribute(
      'href',
      path.replace('&page=2', ''),
    );
    await waitFor(() =>
      expect(
        screen
          .getByText(disabled ? /Đã gỡ ngừng bán thủ công\./ : /Đã ngừng bán thủ công\./)
          .closest('[tabindex="-1"]'),
      ).toHaveFocus(),
    );
    expect(
      api.requests.filter((r) => r.method === 'GET' && r.path.startsWith('/api/admin/products')),
    ).toHaveLength(2);
  });

  it.each([400, 404, 409, 422, 500])(
    'UC-04.2/AC18 loi%s khong retry PATCH, unknown can GET doi chieu',
    async (status) => {
      const api = backend();
      api.state.override = (r) => (r.method === 'PATCH' ? failure(status) : undefined);
      mountCatalog(detailPath);
      confirm(await open(false), false);
      await screen.findByRole('alert');
      expect(api.requests.filter((r) => r.method === 'PATCH')).toHaveLength(1);
      if (status === 500) {
        expect(screen.getByRole('button', { name: 'Ngừng bán' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
        await screen.findByText(/Đã đối chiếu trạng thái hiện tại/);
        expect(screen.getByRole('button', { name: 'Ngừng bán' })).not.toBeDisabled();
      }
    },
  );
});
