import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionQueryKeys } from '@/core';

import { adminCatalogKeys } from './admin-catalog.api.js';
import { catalogSearch, parseCatalogQuery } from './catalog-query.js';
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

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});
const loaded = () => screen.findByRole('link', { name: product.name });

describe('UC-04.2 catalog quản trị chỉ đọc', () => {
  it.each([
    'page=1.5',
    'page=Infinity',
    'page=1e2',
    'page=01',
    'page=-1',
    'page=100001',
    'page=2&page=3',
    'status=hidden',
    'sort=price',
    'q=a&q=b',
    'pageSize=61',
  ])('UC-04.2/AC5 codec loại URL sai %s', (search) => {
    expect(catalogSearch(parseCatalogQuery(`?${search}`))).toBe('');
  });
  it('UC-04.2/AC5 roundtrip chuẩn và giới hạn q', () => {
    const q = parseCatalogQuery(
      '?q=%20SKU%20&status=inactive&sort=name_asc&pageSize=24&page=2&evil=1',
    );
    expect(catalogSearch(q)).toBe('?q=SKU&status=inactive&sort=name_asc&pageSize=24&page=2');
    expect(parseCatalogQuery('?q=' + 'x'.repeat(121)).q).toHaveLength(120);
  });
  it('UC-04.2/AC1 đang khôi phục phiên không gọi admin', async () => {
    const api = backend();
    const gate = deferred<Response>();
    api.state.override = (r) => (r.path === '/api/auth/refresh' ? gate.promise : undefined);
    mountCatalog();
    expect(await screen.findByText('Đang kiểm tra quyền truy cập…')).toBeInTheDocument();
    expect(api.adminRequests()).toHaveLength(0);
    await act(async () => gate.resolve(reply({ accessToken: actorA.id, user: actorA })));
    await loaded();
  });
  it.each([null, { ...actorA, roles: ['CUSTOMER'] }])(
    'UC-04.2/AC1 guest/CUSTOMER không gọi admin: %j',
    async (actor) => {
      const api = backend();
      api.state.actor = actor;
      mountCatalog();
      await screen.findByRole('heading', { name: actor ? 'Không đủ quyền truy cập' : 'Đăng nhập' });
      expect(api.adminRequests()).toHaveLength(0);
    },
  );
  it('UC-04.2/AC2 danh sách ẩn/null, detail và link về giữ điều kiện', async () => {
    backend();
    mountCatalog('/admin/products?q=SKU&status=inactive&sort=name_asc&pageSize=24&page=2');
    fireEvent.click(await loaded());
    await screen.findByRole('heading', { name: product.name });
    expect(screen.getByText('SKU-AN-001')).toBeInTheDocument();
    expect(screen.getByText('Áo khoác · Đã ẩn')).toBeInTheDocument();
    expect(screen.getByText('Chưa có ảnh.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Về danh sách sản phẩm/ })).toHaveAttribute(
      'href',
      '/admin/products?q=SKU&status=inactive&sort=name_asc&pageSize=24&page=2',
    );
  });
  it('UC-04.2/AC5 chỉ fetch URL chuẩn và giữ toolbar theo Back/Forward', async () => {
    const api = backend();
    mountCatalog('/admin/products?page=Infinity&evil=1');
    await loaded();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/products');
    expect(
      api.adminRequests().some((r) => r.path.includes('Infinity') || r.path.includes('evil')),
    ).toBe(false);
    const input = screen.getByRole('textbox', { name: 'Tên sản phẩm hoặc SKU' });
    fireEvent.change(input, { target: { value: 'SKU' } });
    fireEvent.click(screen.getByRole('button', { name: /^Tìm$/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?q=SKU'));
    fireEvent.change(screen.getByLabelText('Cờ hoạt động'), { target: { value: 'inactive' } });
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('status=inactive'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => expect(screen.getByLabelText('Cờ hoạt động')).toHaveValue('all'));
    expect(input).toHaveValue('SKU');
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    await waitFor(() => expect(screen.getByLabelText('Cờ hoạt động')).toHaveValue('inactive'));
  });
  it('UC-04.2/AC5 thay điều kiện về trang 1; trang rỗng có đường phục hồi', async () => {
    const api = backend();
    api.state.products = [];
    api.state.total = 0;
    mountCatalog('/admin/products?q=SKU&status=inactive&page=9');
    const back = await screen.findByRole('link', { name: 'Về trang hợp lệ' });
    expect(back).toHaveAttribute('href', '/admin/products?q=SKU&status=inactive');
    expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Số dòng'), { target: { value: '24' } });
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe(
        '/admin/products?q=SKU&status=inactive&pageSize=24',
      ),
    );
  });
  it.each([400, 404, 422])('UC-04.2/AC8 lỗi %s không tự retry', async (status) => {
    const api = backend();
    api.state.override = (r) => (r.path.startsWith('/api/admin/') ? failure(status) : undefined);
    mountCatalog();
    await screen.findByRole('alert');
    expect(api.adminRequests()).toHaveLength(1);
    expect(screen.queryByRole('link', { name: product.name })).not.toBeInTheDocument();
  });
  it('UC-04.2/AC8 detail không tồn tại có thông báo và link quay lại', async () => {
    backend();
    mountCatalog('/admin/products/missing?q=SKU');
    await screen.findByText('Không tìm thấy sản phẩm này.');
    expect(screen.getByRole('link', { name: /Về danh sách sản phẩm/ })).toHaveAttribute(
      'href',
      '/admin/products?q=SKU',
    );
  });
  it('UC-04.2/AC6 đổi bộ lọc hủy GET và không trình bày tập cũ', async () => {
    const api = backend();
    const gate = deferred<Response>();
    let signal: AbortSignal | null | undefined;
    api.state.override = (r) => {
      if (r.path === '/api/admin/products') {
        signal = r.signal;
        return gate.promise;
      }
      return undefined;
    };
    mountCatalog();
    await screen.findByLabelText('Cờ hoạt động');
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.change(screen.getByLabelText('Cờ hoạt động'), { target: { value: 'inactive' } });
    await loaded();
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      gate.resolve(
        reply({
          items: [{ ...product, name: 'KẾT QUẢ CŨ' }],
          total: 1,
          page: 1,
          pageSize: 12,
          totalPages: 1,
        }),
      ),
    );
    expect(screen.queryByText('KẾT QUẢ CŨ')).not.toBeInTheDocument();
  });
  it.each(['logout', 'actorB', 'sameActor'] as const)(
    'UC-04.2/AC6 %s xóa cache và bỏ GET thành công muộn',
    async (mode) => {
      const api = backend();
      const view = mountCatalog();
      await loaded();
      view.client.setQueryData(['public-catalog'], { retained: true });
      const gate = deferred<Response>();
      let signal: AbortSignal | null | undefined;
      api.state.override = (r) => {
        if (r.path.startsWith('/api/admin/products')) {
          signal = r.signal;
          return gate.promise;
        }
        return undefined;
      };
      act(() => {
        void view.client.invalidateQueries({ queryKey: adminCatalogKeys.all(actorA.id) });
      });
      await waitFor(() => expect(signal).toBeDefined());
      await act(async () => {
        await view.auth().logout();
      });
      expect(signal?.aborted).toBe(true);
      expect(
        view.client
          .getQueriesData({ queryKey: sessionQueryKeys.all })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      api.state.override = undefined;
      if (mode !== 'logout') {
        api.state.products = [{ ...product, name: 'DỮ LIỆU PHIÊN MỚI' }];
        await act(async () => {
          await view.auth().login({
            email: mode === 'actorB' ? actorB.email : actorA.email,
            password: 'synthetic',
          });
          view.go('/admin/products');
        });
        await screen.findByRole('link', { name: 'DỮ LIỆU PHIÊN MỚI' });
      }
      await act(async () =>
        gate.resolve(
          reply({
            items: [{ ...product, name: 'DỮ LIỆU PHIÊN CŨ' }],
            total: 1,
            page: 1,
            pageSize: 12,
            totalPages: 1,
          }),
        ),
      );
      expect(screen.queryByText('DỮ LIỆU PHIÊN CŨ')).not.toBeInTheDocument();
      expect(view.client.getQueryData(['public-catalog'])).toEqual({ retained: true });
      if (mode !== 'sameActor')
        expect(
          view.client
            .getQueriesData({ queryKey: adminCatalogKeys.all(actorA.id) })
            .every(([, data]) => data === undefined),
        ).toBe(true);
      else
        expect(
          view.client.getQueryData(adminCatalogKeys.list(actorA.id, parseCatalogQuery(''))),
        ).toMatchObject({ items: [{ name: 'DỮ LIỆU PHIÊN MỚI' }] });
    },
  );
  it('UC-04.2/AC7 403 rồi GET thành công muộn không khôi phục cache; điều hướng tiếp vẫn bị chặn', async () => {
    const api = backend();
    const view = mountCatalog();
    await loaded();
    const gate = deferred<Response>();
    let signal: AbortSignal | null | undefined;
    api.state.override = (r) =>
      r.path.includes(`/products/${product.id}`)
        ? failure(403)
        : r.path.startsWith('/api/admin/products')
          ? ((signal = r.signal), gate.promise)
          : undefined;
    act(() => {
      void view.client.invalidateQueries({ queryKey: adminCatalogKeys.all(actorA.id) });
    });
    await waitFor(() => expect(signal).toBeDefined());
    fireEvent.click(screen.getByRole('link', { name: product.name }));
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      gate.resolve(reply({ items: [product], total: 1, page: 1, pageSize: 12, totalPages: 1 })),
    );
    expect(
      view.client
        .getQueriesData({ queryKey: sessionQueryKeys.admin })
        .every(([, data]) => data === undefined),
    ).toBe(true);
    expect(view.auth().user?.id).toBe(actorA.id);
    const count = api.adminRequests().length;
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(api.adminRequests()).toHaveLength(count);
    expect(screen.queryByText(product.name)).not.toBeInTheDocument();
  });
});
