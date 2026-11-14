import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cartKeys } from '@/features/cart';

import { adminCatalogKeys } from './admin-catalog.api.js';
import {
  adminCategoriesKeys,
  type AdminCategoryDetail,
  type AdminCategoryNode,
  type UpdateAdminCategoryPayload,
} from './admin-categories.api.js';
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

  it('Đợt 1: tạo danh mục mới mặc định ẩn với client UUID và tự sinh slug', async () => {
    const user = userEvent.setup();
    const api = backend();
    const stateHolder: { created: AdminCategoryDetail | null } = { created: null };

    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') {
        return reply(stateHolder.created ? [...sampleTree, stateHolder.created] : sampleTree);
      }
      if (r.path === '/api/admin/categories' && r.method === 'POST') {
        const body = r.body as {
          id: string;
          name: string;
          slug?: string;
          parentId?: string | null;
          sortOrder?: number;
        };
        const created: AdminCategoryDetail = {
          id: body.id,
          name: body.name,
          slug: body.slug ?? 'ao-len-moi',
          parentId: body.parentId ?? null,
          sortOrder: body.sortOrder ?? 0,
          isActive: false,
          effectiveActive: false,
          parentHidden: false,
          productCount: 0,
          subtreeProductCount: 0,
          updatedAt: '2026-11-14T10:00:00.000Z',
          parent: null,
          children: [],
        };
        stateHolder.created = created;
        return reply(created, 201);
      }
      if (
        stateHolder.created &&
        r.path === `/api/admin/categories/${stateHolder.created.id}` &&
        r.method === 'GET'
      ) {
        return reply(stateHolder.created);
      }
      return undefined;
    };

    mountCatalog('/admin/categories');

    const createLink = await screen.findByTestId('create-category-link');
    await user.click(createLink);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/categories/new');
    });

    await user.type(await screen.findByLabelText(/Tên danh mục/i), 'Áo len mới');
    expect(screen.getByLabelText(/Slug/i)).toHaveValue('ao-len-moi');

    await user.click(screen.getByTestId('submit-create-category'));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toMatch(/^\/admin\/categories\/.+/);
    });
    expect(stateHolder.created?.isActive).toBe(false);
    expect(stateHolder.created?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('Đợt 1: uncertainCreate giữ nguyên UUID qua điều hướng, recheck 404 không xóa marker và gửi lại đúng UUID cũ', async () => {
    const user = userEvent.setup();
    const api = backend();
    const postedIds: string[] = [];
    let failPost = true;
    const stateHolder: { created: AdminCategoryDetail | null } = { created: null };

    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') {
        return reply(stateHolder.created ? [...sampleTree, stateHolder.created] : sampleTree);
      }
      if (r.path === '/api/admin/categories' && r.method === 'POST') {
        const body = r.body as { id: string; name: string; slug: string; sortOrder: number };
        postedIds.push(body.id);
        if (failPost) {
          return failure(500);
        }
        const created: AdminCategoryDetail = {
          id: body.id,
          name: body.name,
          slug: body.slug,
          parentId: null,
          sortOrder: body.sortOrder,
          isActive: false,
          effectiveActive: false,
          parentHidden: false,
          productCount: 0,
          subtreeProductCount: 0,
          updatedAt: '2026-11-14T10:00:00.000Z',
          parent: null,
          children: [],
        };
        stateHolder.created = created;
        return reply(created, 201);
      }
      if (r.path.startsWith('/api/admin/categories/') && r.method === 'GET') {
        if (stateHolder.created && r.path.endsWith(stateHolder.created.id)) {
          return reply(stateHolder.created);
        }
        return failure(404);
      }
      return undefined;
    };

    mountCatalog('/admin/categories/new');

    await user.type(await screen.findByLabelText(/Tên danh mục/i), 'Phụ kiện thử');
    await user.click(screen.getByTestId('submit-create-category'));

    expect(await screen.findByTestId('recheck-create-btn')).toBeInTheDocument();
    expect(postedIds).toHaveLength(1);

    // Điều hướng ra danh sách rồi quay lại /admin/categories/new -> marker vẫn còn
    await user.click(screen.getByRole('link', { name: 'Quay lại danh sách' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/categories');
    await user.click(await screen.findByTestId('create-category-link'));

    expect(await screen.findByTestId('recheck-create-btn')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên danh mục/i)).toHaveValue('Phụ kiện thử');

    // Recheck trả 404 -> KHÔNG xóa marker và cho phép gửi lại cùng UUID
    await user.click(screen.getByTestId('recheck-create-btn'));
    expect(await screen.findByText(/Chưa thấy danh mục trên máy chủ \(404\)/)).toBeInTheDocument();
    expect(screen.getByTestId('submit-create-category')).toHaveTextContent('Gửi lại với cùng mã');

    // Gửi lại thành công bằng đúng UUID cũ
    failPost = false;
    await user.click(screen.getByTestId('submit-create-category'));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(`/admin/categories/${postedIds[0]}`);
    });
    expect(postedIds).toHaveLength(2);
    expect(postedIds[1]).toBe(postedIds[0]);
  });

  it('Đợt 1: chi tiết danh mục khóa chọn cha khi có con, giữ slug readonly và bảo toàn nháp khi PATCH trả 409', async () => {
    const user = userEvent.setup();
    const api = backend();
    const rootDetail: AdminCategoryDetail = {
      ...rootCategory,
      parent: null,
      children: rootCategory.children.map((c) => ({ ...c })),
    };
    const childDetail: AdminCategoryDetail = {
      ...rootCategory.children[0]!,
      parent: {
        id: rootCategory.id,
        name: rootCategory.name,
        slug: rootCategory.slug,
        isActive: rootCategory.isActive,
        effectiveActive: rootCategory.effectiveActive,
      },
      children: [],
    };
    let return409 = true;

    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === `/api/admin/categories/${rootCategory.id}` && r.method === 'GET') {
        return reply(rootDetail);
      }
      if (r.path === `/api/admin/categories/${childDetail.id}` && r.method === 'GET') {
        return reply(childDetail);
      }
      if (r.path === `/api/admin/categories/${childDetail.id}` && r.method === 'PATCH') {
        if (return409) return failure(409);
        const body = r.body as { name: string; sortOrder: number; parentId: string | null };
        childDetail.name = body.name;
        childDetail.sortOrder = body.sortOrder;
        childDetail.parentId = body.parentId;
        childDetail.updatedAt = '2026-11-14T10:05:00.000Z';
        return reply(childDetail);
      }
      return undefined;
    };

    // 1. Kiểm tra danh mục cha có con -> disable select parentId & slug readonly
    const view = mountCatalog(`/admin/categories/${rootCategory.id}`);

    expect(await screen.findByTestId('edit-category-slug-readonly')).toHaveTextContent('ao');
    expect(screen.getByLabelText(/Danh mục cha/i)).toBeDisabled();

    // 2. Chuyển sang danh mục con -> sửa tên, gặp 409 vẫn giữ nguyên nháp
    await act(async () => {
      view.go(`/admin/categories/${childDetail.id}`);
    });
    const nameInput = await screen.findByLabelText(/Tên danh mục/i);
    expect(screen.getByLabelText(/Danh mục cha/i)).not.toBeDisabled();

    await user.clear(nameInput);
    await user.type(nameInput, 'Áo thun bản nháp');
    await user.click(screen.getByTestId('submit-save-category'));

    expect(await screen.findByTestId('reload-latest-category-btn')).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên danh mục/i)).toHaveValue('Áo thun bản nháp');

    // 3. Sau 409 nút lưu bị vô hiệu hóa; người dùng tải lại dữ liệu mới nhất rồi sửa và lưu thành công
    return409 = false;
    expect(screen.getByTestId('submit-save-category')).toBeDisabled();
    await user.click(screen.getByTestId('reload-latest-category-btn'));
    const reloadedInput = await screen.findByLabelText(/Tên danh mục/i);
    await user.clear(reloadedInput);
    await user.type(reloadedInput, 'Áo thun bản nháp');
    await user.click(screen.getByTestId('submit-save-category'));
    expect(await screen.findByText(/Đã lưu cập nhật/)).toBeInTheDocument();
  });

  it('Đợt 1: 403 trên PATCH hoặc response đến muộn sau khi đổi phiên không ghi đè state/cache', async () => {
    const user = userEvent.setup();
    const api = backend();
    const childDetail: AdminCategoryDetail = {
      ...rootCategory.children[0]!,
      parent: {
        id: rootCategory.id,
        name: rootCategory.name,
        slug: rootCategory.slug,
        isActive: rootCategory.isActive,
        effectiveActive: rootCategory.effectiveActive,
      },
      children: [],
    };
    const pendingPatch = deferred<Response>();

    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === `/api/admin/categories/${childDetail.id}` && r.method === 'GET') {
        return reply(childDetail);
      }
      if (r.path === `/api/admin/categories/${childDetail.id}` && r.method === 'PATCH') {
        return pendingPatch.promise;
      }
      return undefined;
    };

    const view = mountCatalog(`/admin/categories/${childDetail.id}`);

    const nameInput = await screen.findByLabelText(/Tên danh mục/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Áo thun đổi phiên');
    await user.click(screen.getByTestId('submit-save-category'));

    // Đổi phiên sang actorB trước khi response PATCH cũ quay về
    await act(async () => {
      await view.auth().login({ email: actorB.email, password: 'synthetic' });
    });
    await act(async () => {
      pendingPatch.resolve(
        reply({
          ...childDetail,
          name: 'Áo thun từ phiên cũ',
          updatedAt: '2026-11-14T10:10:00.000Z',
        }),
      );
    });

    // Dữ liệu của actorA không bị ghi đè bởi response muộn sau đổi phiên
    expect(screen.queryByText(/Đã lưu cập nhật/)).not.toBeInTheDocument();
  });

  it('CODEX dirty draft must keep original CAS token after background refresh', async () => {
    const api = backend();
    const user = userEvent.setup();
    let body: UpdateAdminCategoryPayload | undefined;
    const d: AdminCategoryDetail = { ...sampleDetail, children: [] };
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === `/api/admin/categories/${d.id}` && r.method === 'GET') return reply(d);
      if (r.method === 'PATCH') {
        body = r.body as UpdateAdminCategoryPayload;
        return failure(409);
      }
      return undefined;
    };
    const v = mountCatalog(`/admin/categories/${d.id}`);
    const input = await screen.findByLabelText(/Tên danh mục/i);
    await user.clear(input);
    await user.type(input, 'Draft local');
    await act(async () => {
      v.client.setQueryData(adminCategoriesKeys.detail(actorA.id, d.id), {
        ...d,
        name: 'Remote changed',
        updatedAt: '2026-11-14T12:00:00.000Z',
      });
    });
    await user.click(screen.getByTestId('submit-save-category'));
    await waitFor(() => expect(body).toBeDefined());
    expect(body?.expectedUpdatedAt).toBe(d.updatedAt);
  });

  it('CODEX pending create must remain locked across navigation', async () => {
    const api = backend();
    const user = userEvent.setup();
    const gate = deferred<Response>();
    let posts = 0;
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === '/api/admin/categories' && r.method === 'POST') {
        posts++;
        return gate.promise;
      }
      return undefined;
    };
    const v = mountCatalog('/admin/categories/new');
    await user.type(await screen.findByLabelText(/Tên danh mục/i), 'First category');
    await user.click(screen.getByTestId('submit-create-category'));
    await waitFor(() => expect(posts).toBe(1));
    await act(async () => v.go('/admin/categories'));
    await screen.findByRole('heading', { name: 'Quản lý danh mục' });
    await act(async () => v.go('/admin/categories/new'));
    const input = await screen.findByLabelText(/Tên danh mục/i);
    expect(input).toBeDisabled();
    expect(screen.getByTestId('submit-create-category')).toBeDisabled();
  });

  it('CODEX create recheck must compare submitted payload', async () => {
    const api = backend();
    const user = userEvent.setup();
    let createdId = '';
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === '/api/admin/categories' && r.method === 'POST') {
        createdId = (r.body as { id: string }).id;
        return failure(500);
      }
      if (createdId && r.path === `/api/admin/categories/${createdId}` && r.method === 'GET') {
        return reply({
          ...sampleDetail,
          id: createdId,
          name: 'Different server payload',
          slug: 'different-server',
          children: [],
        });
      }
      return undefined;
    };
    mountCatalog('/admin/categories/new');
    await user.type(await screen.findByLabelText(/Tên danh mục/i), 'Expected payload');
    await user.click(screen.getByTestId('submit-create-category'));
    await user.click(await screen.findByTestId('recheck-create-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/categories/new'),
    );
    expect(screen.queryByText(/Đã xác nhận danh mục/)).not.toBeInTheDocument();
  });

  it('Issue120 review2: dirty draft resets when switching category identity', async () => {
    const api = backend();
    const user = userEvent.setup();
    const a = { ...sampleDetail, children: [] };
    const b = {
      ...sampleDetail,
      id: rootCategory.children[0]!.id,
      name: 'Category B',
      slug: 'category-b',
      children: [],
    };
    api.state.override = (r) => {
      if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
      if (r.path === `/api/admin/categories/${a.id}` && r.method === 'GET') return reply(a);
      if (r.path === `/api/admin/categories/${b.id}` && r.method === 'GET') return reply(b);
      return undefined;
    };
    const view = mountCatalog(`/admin/categories/${a.id}`);
    const input = await screen.findByLabelText(/Tên danh mục/i);
    await user.clear(input);
    await user.type(input, 'Draft category A');
    await act(async () => view.go(`/admin/categories/${b.id}`));
    await screen.findByRole('heading', { name: b.name });
    expect(screen.getByLabelText(/Tên danh mục/i)).toHaveValue(b.name);
    expect(screen.getByTestId('submit-save-category')).not.toBeDisabled();
  });

  it.each(['PATCH', 'RECHECK'] as const)(
    'Issue120 review2: late %s for A cannot change dirty form or marker of B',
    async (mode) => {
      const api = backend();
      const user = userEvent.setup();
      const a = { ...sampleDetail, children: [] };
      const b = {
        ...sampleDetail,
        id: rootCategory.children[0]!.id,
        name: 'Category B',
        slug: 'category-b',
        children: [],
      };
      const gate = deferred<Response>();
      let gateHit = false;
      let checking = false;
      api.state.override = (r) => {
        if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
        if (r.path === `/api/admin/categories/${a.id}` && r.method === 'PATCH') {
          if (mode === 'PATCH') {
            gateHit = true;
            return gate.promise;
          }
          return failure(500);
        }
        if (r.path === `/api/admin/categories/${a.id}` && r.method === 'GET') {
          if (checking) {
            gateHit = true;
            return gate.promise;
          }
          return reply(a);
        }
        if (r.path === `/api/admin/categories/${b.id}` && r.method === 'GET') return reply(b);
        return undefined;
      };
      const view = mountCatalog(`/admin/categories/${a.id}`);
      const input = await screen.findByLabelText(/Tên danh mục/i);
      await user.clear(input);
      await user.type(input, 'Saved category A');
      await user.click(screen.getByTestId('submit-save-category'));
      if (mode === 'RECHECK') {
        checking = true;
        await user.click(await screen.findByTestId('recheck-edit-btn'));
      }
      await waitFor(() => expect(gateHit).toBe(true));
      await act(async () => view.go(`/admin/categories/${b.id}`));
      await screen.findByRole('heading', { name: b.name });
      const bInput = screen.getByLabelText(/Tên danh mục/i);
      await user.clear(bInput);
      await user.type(bInput, 'Unsaved draft B');
      const bMarkerKey = adminCategoriesKeys.uncertainEdit(
        actorA.id,
        view.auth().getSessionEpoch(),
        b.id,
      );
      const bMarker = {
        id: b.id,
        operationId: 99999,
        status: 'uncertain' as const,
        payload: { name: 'Another operation B', expectedUpdatedAt: b.updatedAt },
      };
      await act(async () => view.client.setQueryData(bMarkerKey, bMarker));
      checking = false;
      await act(async () =>
        gate.resolve(
          reply({ ...a, name: 'Saved category A', updatedAt: '2026-11-14T15:00:00.000Z' }),
        ),
      );
      await waitFor(() =>
        expect(
          view.client.getQueryData(
            adminCategoriesKeys.uncertainEdit(actorA.id, view.auth().getSessionEpoch(), a.id),
          ),
        ).toBeNull(),
      );
      expect(screen.getByLabelText(/Tên danh mục/i)).toHaveValue('Unsaved draft B');
      expect(screen.queryByText(/Đã lưu cập nhật cho danh mục/)).not.toBeInTheDocument();
      expect(view.client.getQueryData(bMarkerKey)).toEqual(bMarker);
    },
  );

  it.each(['POST', 'PATCH'] as const)(
    'Issue120 review2: %s timeout aborts and keeps uncertain payload',
    async (method) => {
      const api = backend();
      const gate = deferred<Response>();
      let signal: AbortSignal | undefined;
      let payload: unknown;
      const a = { ...sampleDetail, children: [] };
      api.state.override = (r) => {
        if (r.path === '/api/admin/categories' && r.method === 'GET') return reply(sampleTree);
        if (r.path === `/api/admin/categories/${a.id}` && r.method === 'GET') return reply(a);
        if (
          r.method === method &&
          r.path === (method === 'POST' ? '/api/admin/categories' : `/api/admin/categories/${a.id}`)
        ) {
          signal = r.signal ?? undefined;
          payload = r.body;
          return gate.promise;
        }
        return undefined;
      };
      const view = mountCatalog(
        method === 'POST' ? '/admin/categories/new' : `/admin/categories/${a.id}`,
      );
      const input = await screen.findByLabelText(/Tên danh mục/i);
      fireEvent.change(input, { target: { value: 'Timeout draft' } });
      vi.useFakeTimers();
      try {
        await act(async () =>
          fireEvent.click(
            screen.getByTestId(
              method === 'POST' ? 'submit-create-category' : 'submit-save-category',
            ),
          ),
        );
        expect(payload).toBeDefined();
        await act(async () => vi.advanceTimersByTimeAsync(15000));
        expect(signal?.aborted).toBe(true);
        const key =
          method === 'POST'
            ? adminCategoriesKeys.uncertainCreate(actorA.id, view.auth().getSessionEpoch())
            : adminCategoriesKeys.uncertainEdit(actorA.id, view.auth().getSessionEpoch(), a.id);
        const marker = view.client.getQueryData<{
          status: string;
          payload: Record<string, unknown>;
        }>(key);
        expect(marker?.status).toBe('uncertain');
        expect(marker?.payload.name).toBe('Timeout draft');
        await act(async () => gate.resolve(reply({ ...a, name: 'Too late success' })));
        expect(view.client.getQueryData(key)).toEqual(marker);
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
