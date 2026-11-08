import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUserKeys } from './admin-users.api.js';
import {
  adminA,
  adminB,
  asAdminUser,
  createAdminBackend,
  installDialogStub,
  makeUser,
  type RecordedRequest,
  renderAdminApp,
} from './test-support/admin-harness.js';

vi.mock('@/features/products', () => ({
  CategoryMenu: () => <nav aria-label="Danh mục" />,
  SearchTrigger: () => <button type="button">Tìm kiếm</button>,
  HomePage: () => <p>Trang chủ</p>,
  CategoryPage: () => null,
  SearchPage: () => null,
  ProductListPage: () => null,
  ProductDetailPage: () => null,
  AdminCatalogPage: () => null,
  AdminCatalogDetailPage: () => null,
  AdminProductsPage: () => <p>Tổng quan sản phẩm của Bảo</p>,
}));
vi.mock('@/features/cart', () => ({
  cartKeys: { all: ['cart'], current: () => ['cart', 'current'] },
  getCart: async () => ({ items: [], itemCount: 0 }),
  mergeCart: async () => null,
  CartPage: () => <p>Trang giỏ hàng</p>,
}));

const isList = (request: RecordedRequest) => request.path.startsWith('/api/admin/users?');
const isAdminPost = (request: RecordedRequest) =>
  request.method === 'POST' && request.path.startsWith('/api/admin/');
const adminData = (queryClient: ReturnType<typeof renderAdminApp>['queryClient']) =>
  queryClient
    .getQueriesData({ queryKey: adminUserKeys.all })
    .filter(([, data]) => data !== undefined);

beforeAll(installDialogStub);
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('UC-02.1 Quản trị tài khoản — phiên, cache và kết quả đến muộn', () => {
  it('UC-02.1/AC8 đăng xuất hủy GET danh sách đang chờ, xóa cache quản trị, về đăng nhập', async () => {
    const backend = createAdminBackend({});
    const { queryClient, auth } = renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');

    const gate = backend.hold(isList);
    act(() => {
      void queryClient.invalidateQueries({ queryKey: adminUserKeys.all });
    });
    await waitFor(() => expect(backend.requests.filter(isList)).toHaveLength(2));
    const inFlight = backend.requests.filter(isList)[1];

    await act(async () => {
      await auth().logout();
    });

    expect(inFlight?.signal?.aborted).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(adminData(queryClient)).toEqual([]);
    expect(document.body).not.toHaveTextContent('nguoi-dung-1@example.test');
    gate.resolve();
  });

  it('UC-02.1/AC8 POST khóa về muộn sau khi CÙNG tài khoản đăng nhập lại không ghi vào phiên mới', async () => {
    const target = makeUser(9);
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    // Phan hoi da toi trinh duyet truoc khi bi huy, chi den tay ung dung sau khi phien da doi.
    const gate = backend.hold(isAdminPost, { ignoreAbort: true });
    const { queryClient, auth } = renderAdminApp(`/admin/users/${target.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Khóa tài khoản' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));
    await waitFor(() => expect(backend.posts()).toHaveLength(1));

    await act(async () => {
      await auth().logout();
    });
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: adminA.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    // Cung actorId, khac phien: trang chi tiet tai lai tu dau.
    expect(
      await screen.findByRole('heading', { name: target.email }, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument();

    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(/Đã khóa tài khoản/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const detail = queryClient.getQueryData<{ status: string }>(
      adminUserKeys.detail(adminA.id, target.id),
    );
    expect(detail?.status).toBe('ACTIVE');
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC8 đổi sang quản trị viên khác: không giữ chỗ bằng danh sách của actor cũ', async () => {
    const backend = createAdminBackend({});
    const { auth } = renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');
    expect(screen.getAllByText('Bạn')).toHaveLength(1);

    const gate = backend.hold(isList);
    await act(async () => {
      await auth().login({ email: adminB.email, password: 'Password123' });
    });

    expect(await screen.findByText('Đang tải danh sách người dùng…')).toBeInTheDocument();
    expect(screen.queryByText('nguoi-dung-1@example.test')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    gate.resolve();
    expect(await screen.findByText('nguoi-dung-1@example.test')).toBeInTheDocument();
    const lastList = backend.requests.filter(isList).at(-1);
    expect(lastList?.authorization).not.toBe(backend.requests.filter(isList)[0]?.authorization);
  });

  it('UC-02.1/AC8 GET chi tiết về muộn của phiên cũ không vào cache, phiên mới tự tải lại', async () => {
    const target = makeUser(10);
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    const isDetail = (request: RecordedRequest) => request.path.endsWith(target.id);
    const gate = backend.hold(isDetail, { ignoreAbort: true });
    const { queryClient, auth } = renderAdminApp(`/admin/users/${target.id}`);
    await waitFor(() => expect(backend.requests.filter(isDetail)).toHaveLength(1));

    await act(async () => {
      await auth().login({ email: adminB.email, password: 'Password123' });
    });
    expect(await screen.findByRole('heading', { name: target.email })).toBeInTheDocument();
    await act(async () => {
      gate.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(adminUserKeys.detail(adminA.id, target.id))).toBeUndefined();
    expect(queryClient.getQueryData(adminUserKeys.detail(adminB.id, target.id))).toBeDefined();
    const [stale, fresh] = backend.requests.filter(isDetail);
    expect(stale?.signal?.aborted).toBe(true);
    expect(fresh?.authorization).not.toBe(stale?.authorization);
  });
});
