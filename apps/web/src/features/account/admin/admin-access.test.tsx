import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUserKeys } from './admin-users.api.js';
import { DEFAULT_USER_LIST_QUERY } from './list-query.js';
import {
  adminA,
  apiError,
  asAdminUser,
  createAdminBackend,
  deferred,
  installDialogStub,
  json,
  makeUser,
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
  AdminCategoriesPage: () => null,
  AdminCategoryDetailPage: () => null,
  AdminProductsPage: () => <p>Tổng quan</p>,
}));
vi.mock('@/features/cart', () => ({
  cartKeys: { all: ['cart'], current: () => ['cart', 'current'] },
  getCart: async () => ({ items: [], itemCount: 0 }),
  mergeCart: async () => null,
  CartPage: () => <p>Trang giỏ hàng</p>,
}));

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

const actions = [
  {
    action: 'lock',
    from: 'ACTIVE',
    to: 'LOCKED',
    open: 'Khóa tài khoản',
    confirm: 'Khóa tài khoản',
  },
  { action: 'unlock', from: 'LOCKED', to: 'ACTIVE', open: 'Mở khóa tài khoản', confirm: 'Mở khóa' },
] as const;
const cases = actions.flatMap((action) =>
  (['detail', 'list'] as const).map((source) => ({ ...action, source })),
);

describe('UC-02.1 mất quyền trước khi React cập nhật giao diện', () => {
  it.each(cases)(
    'UC-02.1/AC6 GET $source nhận 403 sát POST $action: không bỏ qua mất quyền hay ghi lại dữ liệu',
    async ({ action, from, to, open, confirm, source }) => {
      const target = makeUser(25, { status: from });
      const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
      const gate = deferred();
      let forbid = false;
      let receivedForbidden = false;
      backend.override((request) => {
        if (request.method === 'POST' && request.path.endsWith(`/${action}`)) {
          // Máy chủ đã xử lý POST trước khi gỡ quyền; chỉ phản hồi của nó đến muộn.
          return gate.promise.then(() => json({ ...target, status: to }));
        }
        if (forbid && request.method === 'GET') {
          receivedForbidden = true;
          return apiError(403, 'FORBIDDEN');
        }
        return undefined;
      });
      const { queryClient, auth } = renderAdminApp('/admin/users');
      fireEvent.click(await screen.findByRole('link', { name: target.email }));
      fireEvent.click(await screen.findByRole('button', { name: open }));
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: confirm }),
      );
      await waitFor(() => expect(backend.posts()).toHaveLength(1));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Đóng' }));
      if (source === 'list') {
        fireEvent.click(screen.getByRole('link', { name: '← Danh sách người dùng' }));
        await screen.findByRole('link', { name: target.email });
      }

      let unsubscribe = () => {};
      const mutationFinished = new Promise<void>((resolve) => {
        unsubscribe = queryClient.getMutationCache().subscribe(() => {
          if (queryClient.isMutating() === 0) resolve();
        });
      });
      try {
        // Giữ hai phản hồi trong cùng batch: không đợi render/effect của trang sau 403.
        await act(async () => {
          forbid = true;
          await queryClient.invalidateQueries({
            queryKey:
              source === 'list'
                ? adminUserKeys.list(adminA.id, DEFAULT_USER_LIST_QUERY)
                : adminUserKeys.detail(adminA.id, target.id),
          });
          gate.resolve();
          await mutationFinished;
        });
      } finally {
        unsubscribe();
      }

      expect(receivedForbidden).toBe(true);
      expect(
        queryClient
          .getQueriesData({ queryKey: adminUserKeys.all })
          .every(([, data]) => data === undefined),
      ).toBe(true);
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(target.email);
      expect(backend.posts()).toHaveLength(1);
      expect(auth().user?.id).toBe(adminA.id);
      expect(backend.requests.some((request) => request.path === '/api/auth/logout')).toBe(false);
    },
  );
});
