import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cartKeys } from '@/features/cart';

import { adminCatalogKeys } from './admin-catalog.api.js';
import type { AdminCategoryDetail, AdminCategoryNode } from './admin-categories.api.js';
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

export const rootCategory: AdminCategoryNode = {
  id: 'c1000000-0000-4000-8000-000000000001',
  name: 'Áo',
  slug: 'ao',
  parentId: null,
  sortOrder: 1,
  isActive: true,
  effectiveActive: true,
  parentHidden: false,
  productCount: 5,
  subtreeProductCount: 15,
  updatedAt: '2026-11-10T08:00:00.000Z',
  children: [
    {
      id: 'c1000000-0000-4000-8000-000000000002',
      name: 'Áo thun',
      slug: 'ao-thun',
      parentId: 'c1000000-0000-4000-8000-000000000001',
      sortOrder: 1,
      isActive: true,
      effectiveActive: true,
      parentHidden: false,
      productCount: 10,
      subtreeProductCount: 10,
      updatedAt: '2026-11-10T08:00:00.000Z',
      children: [],
    },
  ],
};

export const sampleTree: AdminCategoryNode[] = [
  rootCategory,
  {
    id: 'c1000000-0000-4000-8000-000000000003',
    name: 'Quần',
    slug: 'quan',
    parentId: null,
    sortOrder: 2,
    isActive: false,
    effectiveActive: false,
    parentHidden: false,
    productCount: 2,
    subtreeProductCount: 8,
    updatedAt: '2026-11-10T08:00:00.000Z',
    children: [
      {
        id: 'c1000000-0000-4000-8000-000000000004',
        name: 'Quần dài',
        slug: 'quan-dai',
        parentId: 'c1000000-0000-4000-8000-000000000003',
        sortOrder: 1,
        isActive: true,
        effectiveActive: false,
        parentHidden: true,
        productCount: 6,
        subtreeProductCount: 6,
        updatedAt: '2026-11-10T08:00:00.000Z',
        children: [],
      },
    ],
  },
];

export const sampleDetail: AdminCategoryDetail = {
  id: 'c1000000-0000-4000-8000-000000000001',
  name: 'Áo',
  slug: 'ao',
  parentId: null,
  sortOrder: 1,
  isActive: true,
  effectiveActive: true,
  parentHidden: false,
  productCount: 5,
  subtreeProductCount: 15,
  updatedAt: '2026-11-10T08:00:00.000Z',
  parent: null,
  children: [
    {
      id: 'c1000000-0000-4000-8000-000000000002',
      name: 'Áo thun',
      slug: 'ao-thun',
      sortOrder: 1,
      isActive: true,
      effectiveActive: true,
      parentHidden: false,
      productCount: 10,
      subtreeProductCount: 10,
      updatedAt: '2026-11-10T08:00:00.000Z',
    },
  ],
};

async function hideCategory(categoryName = 'Áo') {
  fireEvent.click(await screen.findByRole('button', { name: `Ẩn danh mục ${categoryName}` }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ẩn danh mục' }));
}

async function showCategory(categoryName = 'Quần') {
  fireEvent.click(await screen.findByRole('button', { name: `Hiện danh mục ${categoryName}` }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Hiện danh mục' }));
}

describe('Admin Categories UI (UC-04.1/AC2, AC6)', () => {
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
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('UC-04.1/AC2 hiển thị cây danh mục với phân cấp cha con, số đếm và huy hiệu trạng thái', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories' ? reply(sampleTree) : undefined;
    mountCatalog('/admin/categories');

    // Chờ hàng của danh mục cha "Áo" xuất hiện
    const aoRow = await screen.findByTestId('category-row-ao');
    expect(within(aoRow).getByText('Áo')).toBeInTheDocument();
    expect(within(aoRow).getByText('Đang hiện')).toBeInTheDocument();
    expect(within(aoRow).getByText('5')).toBeInTheDocument();
    expect(within(aoRow).getByText('15')).toBeInTheDocument();

    // Danh mục con "Áo thun" hiển thị
    const aoThunRow = screen.getByTestId('category-row-ao-thun');
    expect(within(aoThunRow).getByText('Áo thun')).toBeInTheDocument();
    expect(within(aoThunRow).getAllByText('10')).toHaveLength(2);

    // Danh mục cha "Quần" hiển thị "Đang ẩn"
    const quanRow = screen.getByTestId('category-row-quan');
    expect(within(quanRow).getByText('Đang ẩn')).toBeInTheDocument();

    // Danh mục con "Quần dài" có cha đang ẩn -> hiển thị "Bị ẩn do cha"
    const quanDaiRow = screen.getByTestId('category-row-quan-dai');
    expect(within(quanDaiRow).getByText('Bị ẩn do cha')).toBeInTheDocument();
  });

  it('UC-04.1/AC6 mở ConfirmDialog khi bấm Ẩn, hủy bỏ không gửi PATCH', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories' ? reply(sampleTree) : undefined;
    mountCatalog('/admin/categories');

    const user = userEvent.setup();

    // Bấm nút "Ẩn danh mục Áo"
    const aoRow = await screen.findByTestId('category-row-ao');
    const hideBtn = within(aoRow).getByRole('button', { name: 'Ẩn danh mục Áo' });
    await user.click(hideBtn);

    // Hộp thoại xác nhận mở ra
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Ẩn danh mục?' })).toBeInTheDocument();
    expect(within(dialog).getByText('Áo')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Ẩn danh mục cha này sẽ làm toàn bộ các danh mục con/),
    ).toBeInTheDocument();

    // Bấm Hủy
    const cancelBtn = within(dialog).getByRole('button', { name: 'Hủy' });
    await user.click(cancelBtn);

    // Dialog đóng và không có request PATCH nào được gửi
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('UC-04.1/AC6 xác nhận ẩn gửi PATCH đúng expectedUpdatedAt và isActive=false', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply(sampleTree);
      if (r.path.endsWith('/visibility') && r.method === 'PATCH') {
        return reply({
          ...rootCategory,
          isActive: false,
          effectiveActive: false,
          updatedAt: '2026-11-10T08:01:00.000Z',
        });
      }
      return undefined;
    };
    mountCatalog('/admin/categories');

    await hideCategory('Áo');

    await waitFor(() => {
      const patchReq = api.requests.find((r) => r.method === 'PATCH');
      expect(patchReq).toBeDefined();
      expect(patchReq?.body).toEqual({
        isActive: false,
        expectedUpdatedAt: '2026-11-10T08:00:00.000Z',
      });
    });

    // Thông báo thành công hiển thị
    await waitFor(() => {
      expect(screen.getByText('Đã ẩn danh mục "Áo" thành công.')).toBeInTheDocument();
    });
  });

  it('UC-04.1/AC6 xác nhận hiện gửi PATCH đúng expectedUpdatedAt và isActive=true', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply(sampleTree);
      if (r.path.endsWith('/visibility') && r.method === 'PATCH') {
        return reply({
          ...sampleTree[1],
          isActive: true,
          effectiveActive: true,
          updatedAt: '2026-11-10T08:01:00.000Z',
        });
      }
      return undefined;
    };
    mountCatalog('/admin/categories');

    await showCategory('Quần');

    await waitFor(() => {
      const patchReq = api.requests.find((r) => r.method === 'PATCH');
      expect(patchReq).toBeDefined();
      expect(patchReq?.body).toEqual({
        isActive: true,
        expectedUpdatedAt: '2026-11-10T08:00:00.000Z',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Đã hiện danh mục "Quần" thành công.')).toBeInTheDocument();
    });
  });

  it('UC-04.1/AC6 xử lý xung đột 409: thông báo tải lại dữ liệu mới nhất', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply(sampleTree);
      if (r.path.endsWith('/visibility') && r.method === 'PATCH') {
        return failure(409);
      }
      return undefined;
    };
    mountCatalog('/admin/categories');

    await hideCategory('Áo');

    await waitFor(() => {
      expect(screen.getByText(/Danh mục đã được thay đổi trên máy chủ/)).toBeInTheDocument();
    });
  });

  it('UC-04.1/AC6 trang chi tiết hiển thị đầy đủ thông tin, cha con và số đếm', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === `/api/admin/categories/${sampleDetail.id}`) return reply(sampleDetail);
      return undefined;
    };
    mountCatalog(`/admin/categories/${sampleDetail.id}`);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Áo' })).toBeInTheDocument();
    });

    expect(screen.getByText('Đường dẫn tĩnh: /ao')).toBeInTheDocument();
    expect(screen.getByText('Các danh mục con (1)')).toBeInTheDocument();

    const childRow = screen.getByTestId('child-row-ao-thun');
    expect(within(childRow).getByText('Áo thun')).toBeInTheDocument();
    expect(within(childRow).getByText('10')).toBeInTheDocument();
  });

  // --- Ba kịch bản hồi quy P2 từ Review độc lập của Codex ---

  it('UC-04.1/AC6 review79: unknown PATCH result must require reconciliation before another mutation', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories'
        ? reply([rootCategory])
        : r.path.endsWith('/visibility')
          ? failure(500)
          : undefined;
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });
    await hideCategory('Áo');
    await screen.findByText(
      'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
    );
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expect(screen.getByRole('button', { name: 'Ẩn danh mục Áo' })).toBeDisabled();
  });

  it('UC-04.1/AC6 review79: detail 400 must not be automatically retried', async () => {
    const api = backend();
    const path = '/api/admin/categories/' + rootCategory.id;
    api.state.override = (r) => (r.path === path ? failure(400) : undefined);
    const view = mountCatalog('/admin/categories/' + rootCategory.id);
    view.client.setDefaultOptions({ queries: { retry: 1, retryDelay: 0 } });
    await waitFor(() =>
      expect(api.requests.filter((r) => r.path === path).length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    expect(api.requests.filter((r) => r.path === path)).toHaveLength(1);
  });

  it('UC-04.1/AC6 review79: 403 during post-mutation refetch must suppress subsequent success notice', async () => {
    const api = backend();
    const gate = deferred<Response>();
    let reads = 0;
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories')
        return ++reads === 1 ? reply([rootCategory]) : gate.promise;
      if (r.path.endsWith('/visibility'))
        return reply({ ...rootCategory, isActive: false, updatedAt: '2026-11-10T08:00:00.001Z' });
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });
    await hideCategory('Áo');
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      gate.resolve(failure(403));
    });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    expect(screen.queryByText('Đã ẩn danh mục "Áo" thành công.')).not.toBeInTheDocument();
  });

  // --- Bổ sung ma trận toàn diện kiểm thử unknown, timeout, mạng, đối chiếu và phiên ---

  it('UC-04.1/AC6 PATCH hết giờ (TimeoutError) chuyển sang unknown, khóa nút và nút đối chiếu giải tỏa sau khi GET thành công', async () => {
    const api = backend();
    let patched = false;
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') {
        return reply(patched ? [{ ...rootCategory, isActive: false }] : [rootCategory]);
      }
      if (r.path.endsWith('/visibility')) {
        patched = true;
        const err = new DOMException('Timeout', 'TimeoutError');
        return Promise.reject(err);
      }
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    await hideCategory('Áo');

    // Chờ thông báo lỗi chưa rõ kết quả xuất hiện
    await screen.findByText(
      'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
    );
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Nút ẩn bị disabled vì đang trong trạng thái cần đối chiếu (needsCheck)
    const aoBtn = screen.getByRole('button', { name: 'Ẩn danh mục Áo' });
    expect(aoBtn).toBeDisabled();

    // Bấm nút "Kiểm tra lại trạng thái"
    const recheckBtn = screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' });
    fireEvent.click(recheckBtn);

    // Sau khi đối chiếu thành công, trạng thái mới được cập nhật và nút được mở khóa
    await screen.findByText(
      'Đã đối chiếu trạng thái hiện tại. Bạn có thể xem và xác nhận thao tác mới.',
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hiện danh mục Áo' })).not.toBeDisabled();
    });
  });

  it('UC-04.1/AC6 mất mạng (Failed to fetch) trên PATCH cũng khóa nút và đối chiếu lại trạng thái cho hướng hiện', async () => {
    const inactiveNode: AdminCategoryNode = {
      ...rootCategory,
      id: 'c1000000-0000-4000-8000-000000000009',
      name: 'Váy',
      slug: 'vay',
      isActive: false,
      effectiveActive: false,
    };
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([inactiveNode]);
      if (r.path.endsWith('/visibility')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    await showCategory('Váy');

    await screen.findByText(
      'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
    );
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Nút Hiện danh mục Váy bị disabled
    expect(screen.getByRole('button', { name: 'Hiện danh mục Váy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' })).toBeInTheDocument();
  });

  it('UC-04.1/AC6 marker unknown được giữ qua điều hướng list và detail trong cùng phiên', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([rootCategory]);
      if (r.path === `/api/admin/categories/${rootCategory.id}`) {
        return reply({ ...sampleDetail, id: rootCategory.id });
      }
      if (r.path.endsWith('/visibility')) return failure(500);
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    await hideCategory('Áo');
    await screen.findByText(
      'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
    );

    // Điều hướng sang trang chi tiết
    act(() => {
      view.go(`/admin/categories/${rootCategory.id}`);
    });

    // Trang chi tiết vẫn hiển thị cảnh báo và khóa nút thao tác
    await screen.findByText(
      'Có yêu cầu chưa xác định kết quả. Kiểm tra lại trạng thái trước thao tác tiếp theo.',
    );
    const detailToggleBtn = await screen.findByRole('button', { name: 'Ẩn danh mục' });
    expect(detailToggleBtn).toBeDisabled();
  });

  it('UC-04.1/AC6 tree query không tự retry khi gặp 400, 403, 404, 422', async () => {
    for (const status of [400, 403, 404, 422]) {
      const api = backend();
      api.state.override = (r) =>
        r.path === '/api/admin/categories' ? failure(status) : undefined;
      const view = mountCatalog('/admin/categories');
      view.client.setDefaultOptions({ queries: { retry: 1, retryDelay: 0 } });

      await waitFor(() =>
        expect(
          api.requests.filter((r) => r.path === '/api/admin/categories').length,
        ).toBeGreaterThan(0),
      );
      await waitFor(() => expect(view.client.isFetching()).toBe(0));
      expect(api.requests.filter((r) => r.path === '/api/admin/categories')).toHaveLength(1);
      cleanup();
    }
  });

  it('UC-04.1/AC6 detail query gặp 404 không retry và hiển thị thông báo danh mục không tìm thấy', async () => {
    const api = backend();
    const id = 'c9999999-0000-4000-8000-000000000000';
    const apiPath = `/api/admin/categories/${id}`;
    api.state.override = (r) => (r.path === apiPath ? failure(404) : undefined);
    const view = mountCatalog(`/admin/categories/${id}`);
    view.client.setDefaultOptions({ queries: { retry: 1, retryDelay: 0 } });

    await screen.findByText('Không tìm thấy danh mục này.');
    await waitFor(() => expect(view.client.isFetching()).toBe(0));
    expect(api.requests.filter((r) => r.path === apiPath)).toHaveLength(1);
  });

  it('UC-04.1/AC6 trực tiếp nhận 403 từ PATCH gọi markForbidden và không hiện thông báo thành công', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([rootCategory]);
      if (r.path.endsWith('/visibility')) return failure(403);
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    await hideCategory('Áo');

    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/thành công/)).not.toBeInTheDocument();
  });

  it('UC-04.1/AC6 409 conflict trong lúc mutation kiểm tra lại current sau refetch để tránh rò rỉ notice khi mất quyền', async () => {
    const api = backend();
    const gate = deferred<Response>();
    let reads = 0;
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories')
        return ++reads === 1 ? reply([rootCategory]) : gate.promise;
      if (r.path.endsWith('/visibility')) return failure(409);
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    await hideCategory('Áo');
    await waitFor(() => expect(reads).toBe(2));

    // Refetch trả 403 làm mất quyền
    await act(async () => {
      gate.resolve(failure(403));
    });
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Không hiện thông báo xung đột của 409 vì phiên đã mất quyền
    expect(screen.queryByText(/Danh mục đã được thay đổi trên máy chủ/)).not.toBeInTheDocument();
  });

  // --- Hồi quy P2 Review lượt 2: Làm mới cache Admin Products và Cart khi thay đổi danh mục ---

  it('UC-04.1/AC6 review79: category visibility change must refresh cached admin product category visibility', async () => {
    const api = backend();
    let category = { ...rootCategory };
    api.state.products = [
      {
        ...product,
        category: {
          ...product.category,
          id: rootCategory.id,
          name: rootCategory.name,
          slug: rootCategory.slug,
          isActive: true,
        },
      },
    ];
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([category]);
      if (r.path.endsWith('/visibility')) {
        category = {
          ...category,
          isActive: false,
          effectiveActive: false,
          updatedAt: '2026-11-10T08:00:00.001Z',
        };
        api.state.products = api.state.products.map((p) => ({
          ...p,
          category: { ...p.category, isActive: false },
        }));
        return reply(category);
      }
      return undefined;
    };
    const view = mountCatalog('/admin/products/' + product.id);
    view.client.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    });
    await screen.findByRole('heading', { name: product.name });
    await act(async () => {
      view.go('/admin/categories');
    });
    await hideCategory('Áo');
    await screen.findByText('Đã ẩn danh mục "Áo" thành công.');
    await waitFor(() => expect(view.client.isMutating()).toBe(0));
    await act(async () => {
      view.go('/admin/products/' + product.id);
    });
    await screen.findByRole('heading', { name: product.name });
    expect(await screen.findByText(/Đã ẩn/)).toBeInTheDocument();
  });

  it('UC-04.1/AC6 bật lại danh mục làm mới cache chi tiết sản phẩm admin và gỡ nhãn "Đã ẩn"', async () => {
    const api = backend();
    let category = { ...rootCategory, isActive: false, effectiveActive: false };
    api.state.products = [
      {
        ...product,
        category: {
          ...product.category,
          id: rootCategory.id,
          name: rootCategory.name,
          slug: rootCategory.slug,
          isActive: false,
        },
      },
    ];
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([category]);
      if (r.path.endsWith('/visibility')) {
        category = {
          ...category,
          isActive: true,
          effectiveActive: true,
          updatedAt: '2026-11-10T08:00:00.001Z',
        };
        api.state.products = api.state.products.map((p) => ({
          ...p,
          category: { ...p.category, isActive: true },
        }));
        return reply(category);
      }
      return undefined;
    };
    const view = mountCatalog('/admin/products/' + product.id);
    view.client.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    });
    await screen.findByRole('heading', { name: product.name });
    expect(await screen.findByText(/Đã ẩn/)).toBeInTheDocument();

    await act(async () => {
      view.go('/admin/categories');
    });
    await showCategory('Áo');
    await screen.findByText('Đã hiện danh mục "Áo" thành công.');
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    await act(async () => {
      view.go('/admin/products/' + product.id);
    });
    await screen.findByRole('heading', { name: product.name });
    expect(screen.queryByText(/Đã ẩn/)).not.toBeInTheDocument();
  });

  it('UC-04.1/AC6 đường đối chiếu sau unknown làm mới cache admin products của actor', async () => {
    const api = backend();
    let category = { ...rootCategory };
    api.state.products = [
      {
        ...product,
        category: {
          ...product.category,
          id: rootCategory.id,
          name: rootCategory.name,
          slug: rootCategory.slug,
          isActive: true,
        },
      },
    ];
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([category]);
      if (r.path.endsWith('/visibility')) {
        // Mô phỏng server đã đổi trạng thái nhưng trả về 500 do lỗi mạng/máy chủ
        category = {
          ...category,
          isActive: false,
          effectiveActive: false,
          updatedAt: '2026-11-10T08:00:00.001Z',
        };
        api.state.products = api.state.products.map((p) => ({
          ...p,
          category: { ...p.category, isActive: false },
        }));
        return failure(500);
      }
      return undefined;
    };
    const view = mountCatalog('/admin/products/' + product.id);
    view.client.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    });
    await screen.findByRole('heading', { name: product.name });

    await act(async () => {
      view.go('/admin/categories');
    });
    await hideCategory('Áo');
    await screen.findByText(
      'Không thể cập nhật trạng thái danh mục. Kiểm tra kết nối rồi thử lại.',
    );
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Thực hiện đối chiếu trạng thái
    const recheckBtn = screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' });
    fireEvent.click(recheckBtn);
    await screen.findByText(
      'Đã đối chiếu trạng thái hiện tại. Bạn có thể xem và xác nhận thao tác mới.',
    );

    // Quay lại trang chi tiết sản phẩm: cache đã được invalidate và fetch lại trạng thái mới nhất
    await act(async () => {
      view.go('/admin/products/' + product.id);
    });
    await screen.findByRole('heading', { name: product.name });
    expect(await screen.findByText(/Đã ẩn/)).toBeInTheDocument();
  });

  it('UC-04.1/AC6 ẩn danh mục cha làm mới cache sản phẩm thuộc danh mục con', async () => {
    const api = backend();
    const childId = rootCategory.children[0]!.id;
    let tree = [rootCategory];
    api.state.products = [
      {
        ...product,
        category: {
          id: childId,
          name: 'Áo thun',
          slug: 'ao-thun',
          isActive: true,
        },
      },
    ];
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply(tree);
      if (r.path.endsWith('/visibility')) {
        tree = [
          {
            ...rootCategory,
            isActive: false,
            effectiveActive: false,
            children: [
              {
                ...rootCategory.children[0]!,
                effectiveActive: false,
                parentHidden: true,
              },
            ],
          },
        ];
        return reply({
          ...rootCategory,
          isActive: false,
          effectiveActive: false,
        });
      }
      return undefined;
    };

    const view = mountCatalog('/admin/products/' + product.id);
    view.client.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
    });
    await screen.findByRole('heading', { name: product.name });

    await act(async () => {
      view.go('/admin/categories');
    });
    await hideCategory('Áo');
    await screen.findByText('Đã ẩn danh mục "Áo" thành công.');
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Cache admin catalog đã bị invalidate
    const queryData = view.client.getQueryState(adminCatalogKeys.detail(actorA.id, product.id));
    expect(queryData?.isInvalidated).toBe(true);
  });

  it('UC-04.1/AC6 thay đổi trạng thái danh mục của Actor A chỉ làm mới cache của Actor A, giữ nguyên cache của Actor B', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([rootCategory]);
      if (r.path.endsWith('/visibility'))
        return reply({ ...rootCategory, isActive: false, updatedAt: '2026-11-10T08:00:00.001Z' });
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    // Chờ phiên đăng nhập và giao diện danh mục sẵn sàng
    await screen.findByRole('button', { name: 'Ẩn danh mục Áo' });

    // Đặt sẵn dữ liệu cache giả lập cho Actor B
    view.client.setQueryData(adminCatalogKeys.detail(actorB.id, product.id), {
      ...product,
      name: 'Sản phẩm của Actor B',
    });

    await hideCategory('Áo');
    await screen.findByText('Đã ẩn danh mục "Áo" thành công.');
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    // Cache của Actor B vẫn còn nguyên vẹn, không bị invalidated
    const actorBCache = view.client.getQueryState(adminCatalogKeys.detail(actorB.id, product.id));
    expect(actorBCache?.isInvalidated).toBe(false);
    expect(view.client.getQueryData(adminCatalogKeys.detail(actorB.id, product.id))).toMatchObject({
      name: 'Sản phẩm của Actor B',
    });
  });

  it('UC-04.1/AC6 thay đổi trạng thái danh mục làm mới cache cartKeys.all', async () => {
    const api = backend();
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories') return reply([rootCategory]);
      if (r.path.endsWith('/visibility'))
        return reply({ ...rootCategory, isActive: false, updatedAt: '2026-11-10T08:00:00.001Z' });
      return undefined;
    };
    const view = mountCatalog('/admin/categories');
    view.client.setDefaultOptions({ queries: { retry: false } });

    // Đặt sẵn dữ liệu cache giỏ hàng
    view.client.setQueryData(cartKeys.all, { items: [], itemCount: 0 });

    await hideCategory('Áo');
    await screen.findByText('Đã ẩn danh mục "Áo" thành công.');
    await waitFor(() => expect(view.client.isMutating()).toBe(0));

    const cartCache = view.client.getQueryState(cartKeys.all);
    expect(cartCache?.isInvalidated).toBe(true);
  });

  it('UC-04.1/AC2 hiển thị 4 chỉ số KPI không đếm trùng subtreeProductCount và không đổi khi tìm kiếm', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories' ? reply(sampleTree) : undefined;
    mountCatalog('/admin/categories');

    // sampleTree gồm 4 node: Áo (effectiveActive=true, productCount=5, subtree=15),
    // Áo thun (effectiveActive=true, productCount=10, subtree=10),
    // Quần (effectiveActive=false, productCount=0, subtree=3),
    // Quần dài (effectiveActive=false, productCount=3, subtree=3)
    expect(await screen.findByTestId('kpi-total-categories')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-visible-categories')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-hidden-categories')).toHaveTextContent('2');
    // Chỉ cộng productCount (5 + 10 + 0 + 8 = 23), không cộng subtreeProductCount (41)
    expect(screen.getByTestId('kpi-categorized-products')).toHaveTextContent('23');

    // Khi tìm kiếm thu hẹp danh sách, KPI vẫn giữ nguyên số liệu toàn cây
    const user = userEvent.setup();
    const searchInput = screen.getByRole('searchbox', {
      name: 'Tìm theo tên danh mục hoặc slug',
    });
    await user.type(searchInput, 'ao-thun');
    expect(screen.getByTestId('kpi-total-categories')).toHaveTextContent('4');
    expect(screen.getByTestId('kpi-categorized-products')).toHaveTextContent('23');
  });

  it('UC-04.1/AC2 tìm kiếm theo tên/slug giữ cha làm ngữ cảnh và phân biệt cây rỗng với không có kết quả', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories' ? reply(sampleTree) : undefined;
    mountCatalog('/admin/categories');

    await screen.findByTestId('category-row-ao');
    const user = userEvent.setup();
    const searchInput = screen.getByRole('searchbox', {
      name: 'Tìm theo tên danh mục hoặc slug',
    });

    // Tìm theo slug của danh mục con "quan-dai" -> giữ cha "Quần" làm ngữ cảnh, ẩn nhánh "Áo"
    await user.type(searchInput, 'quan-dai');
    expect(screen.getByTestId('category-row-quan')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-quan-dai')).toBeInTheDocument();
    expect(screen.queryByTestId('category-row-ao')).not.toBeInTheDocument();

    // Không có kết quả khớp -> hiển thị thông báo không tìm thấy (khác "Chưa có danh mục")
    await user.clear(searchInput);
    await user.type(searchInput, 'khong-ton-tai');
    expect(screen.getByText(/Không tìm thấy danh mục phù hợp/)).toBeInTheDocument();
    expect(screen.queryByText('Chưa có danh mục nào trong hệ thống.')).not.toBeInTheDocument();

    // Bấm "Xóa tìm kiếm" khôi phục lại toàn bộ cây
    await user.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }));
    expect(screen.getByTestId('category-row-ao')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-quan')).toBeInTheDocument();
  });

  it('UC-04.1/AC6 mở/thu gọn từng nhánh, Mở hết/Thu gọn và khôi phục trạng thái sau khi xóa tìm kiếm', async () => {
    const api = backend();
    api.state.override = (r) =>
      r.path === '/api/admin/categories' ? reply(sampleTree) : undefined;
    mountCatalog('/admin/categories');

    await screen.findByTestId('category-row-ao');
    const user = userEvent.setup();

    // Thu gọn nhánh "Áo", giữ nhánh "Quần" đang mở
    await user.click(screen.getByRole('button', { name: 'Thu gọn nhánh Áo' }));
    expect(screen.queryByTestId('category-row-ao-thun')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-row-quan-dai')).toBeInTheDocument();

    // Tìm "ao-thun" -> tự động mở nhánh "Áo" để thấy con khớp
    const searchInput = screen.getByRole('searchbox', {
      name: 'Tìm theo tên danh mục hoặc slug',
    });
    await user.type(searchInput, 'ao-thun');
    expect(screen.getByTestId('category-row-ao')).toBeInTheDocument();
    expect(screen.getByTestId('category-row-ao-thun')).toBeInTheDocument();

    // Xóa tìm kiếm -> khôi phục đúng trạng thái trước tìm kiếm ("Áo" vẫn thu gọn, "Quần" vẫn mở)
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(screen.queryByTestId('category-row-ao-thun')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-row-quan-dai')).toBeInTheDocument();

    // Nút Mở hết và Thu gọn toàn cây
    await user.click(screen.getByRole('button', { name: 'Mở hết' }));
    expect(screen.getByTestId('category-row-ao-thun')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(screen.queryByTestId('category-row-ao-thun')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-row-quan-dai')).not.toBeInTheDocument();
  });

  it('UC-04.1/AC6 trạng thái tải, lỗi, cây rỗng và 403 không hiển thị thẻ KPI số 0', async () => {
    const api = backend();
    const pending = deferred<Response>();
    api.state.override = (r) => (r.path === '/api/admin/categories' ? pending.promise : undefined);
    const view = mountCatalog('/admin/categories');

    // Đang tải -> chưa hiển thị KPI
    expect(screen.queryByTestId('kpi-total-categories')).not.toBeInTheDocument();

    // Trả về cây rỗng -> hiển thị trạng thái rỗng, không hiển thị KPI 0
    await act(async () => {
      pending.resolve(reply([]));
    });
    expect(await screen.findByText('Chưa có danh mục nào trong hệ thống.')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-total-categories')).not.toBeInTheDocument();

    // Lỗi 500 -> hiển thị alert, không hiển thị KPI
    api.state.override = (r) => (r.path === '/api/admin/categories' ? failure(500) : undefined);
    await act(async () => {
      await view.client.invalidateQueries();
    });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-total-categories')).not.toBeInTheDocument();

    // 403 -> hiển thị AdminForbidden, không hiển thị KPI
    api.state.override = (r) => (r.path === '/api/admin/categories' ? failure(403) : undefined);
    await act(async () => {
      await view.client.invalidateQueries();
    });
    expect(await screen.findByText(/Không đủ quyền/)).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-total-categories')).not.toBeInTheDocument();
  });
});
