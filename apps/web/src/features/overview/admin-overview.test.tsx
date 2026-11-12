import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider, useAuth } from '@/features/account';

import { overviewKeys } from './admin-overview.api.js';

const actor: AuthenticatedUser = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  roles: ['ADMIN'],
};

const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const error = (status: number) =>
  reply({ statusCode: status, code: 'TEST_ERROR', message: 'Synthetic error' }, status);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { resolve, reject, promise };
}

const mockUsersData = { items: [{ id: 'u1' }], total: 137 };
const mockProductsData = { items: [{ id: 'p1' }], total: 42 };
const mockOrdersData = { items: [{ id: 'o1' }], total: 89 };
const mockAttentionData = {
  items: [
    {
      id: 'ord-1',
      orderCode: 'ORD-ATTN-001',
      status: 'PAYMENT_REVIEW',
      createdAt: '2026-11-10T10:00:00.000Z',
      customerEmail: 'customer@example.test',
      totalAmount: '500000',
      itemCount: 2,
      gateway: 'VNPAY',
      paymentStatus: 'PENDING',
      refundedAmount: '0',
      refundPending: false,
    },
  ],
  total: 5,
};
const mockLowStockData = {
  items: [
    {
      id: 'var-1',
      sku: 'SKU-LOW-001',
      productName: 'Áo Thun Cotton',
      colorName: 'Đen',
      sizeCode: 'M',
      quantityOnHand: 4,
      reservedQuantity: 1,
      availableQuantity: 3,
    },
  ],
  total: 3,
  threshold: 5,
  asOf: '2026-11-11T00:00:00.000Z',
};

function setup(
  path = '/admin',
  user: AuthenticatedUser | null = actor,
  override?: (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined,
) {
  let current = user;
  const requests: { url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push({ url, init });

      if (url.pathname === '/api/auth/refresh') {
        return current ? reply({ accessToken: current.id, user: current }) : error(401);
      }
      if (url.pathname === '/api/auth/logout') {
        current = null;
        return reply({});
      }

      const custom = override?.(url, init);
      if (custom) return custom;

      if (url.pathname === '/api/admin/users') return reply(mockUsersData);
      if (url.pathname === '/api/admin/products') return reply(mockProductsData);
      if (url.pathname === '/api/admin/orders') {
        if (url.searchParams.has('tab')) {
          return reply({ statusCode: 400, message: ['property tab should not exist'] }, 400);
        }
        if (url.searchParams.get('attention') === 'true') {
          return reply(mockAttentionData);
        }
        return reply(mockOrdersData);
      }
      if (url.pathname === '/api/admin/inventory/low-stock') {
        return reply(mockLowStockData);
      }
      if (url.pathname === '/api/cart') return reply({ items: [], itemCount: 0 });

      throw new Error('Unexpected test request ' + url.pathname + url.search);
    }),
  );

  const client = new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0, gcTime: 0 },
    },
  });

  let authContext!: ReturnType<typeof useAuth>;
  function AuthWatcher() {
    authContext = useAuth();
    return null;
  }

  function LocationProbe() {
    const loc = useLocation();
    return (
      <div data-testid="location">
        {loc.pathname}
        {loc.search}
      </div>
    );
  }

  const renderResult = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthWatcher />
        <MemoryRouter initialEntries={[path]}>
          <LocationProbe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...renderResult,
    client,
    requests,
    auth: () => authContext,
  };
}

describe('Issue #92: Tổng quan admin chỉ đọc (/admin)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Issue #92 / AC1: hiển thị đủ 4 KPI từ total của server, không dùng items.length', async () => {
    setup('/admin');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' }),
      ).toBeInTheDocument();
    });

    // Users total: 137 (dù mock items chỉ có 1)
    await waitFor(() => {
      expect(screen.getByText('137')).toBeInTheDocument();
    });
    // Products total: 42
    expect(screen.getByText('42')).toBeInTheDocument();
    // Orders total: 89
    expect(screen.getByText('89')).toBeInTheDocument();
    // Attention total: 5
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);

    // Kiểm tra liên kết của các thẻ KPI (trong vùng chỉ số chính, tránh nhầm với sidebar)
    const kpiSection = screen.getByRole('region', { name: 'Chỉ số hoạt động chính' });
    expect(kpiSection.querySelector('a[href="/admin/users"]')).toBeInTheDocument();
    expect(kpiSection.querySelector('a[href="/admin/products"]')).toBeInTheDocument();
    expect(kpiSection.querySelector('a[href="/admin/orders?tab=all"]')).toBeInTheDocument();
    expect(kpiSection.querySelector('a[href="/admin/orders?tab=attention"]')).toBeInTheDocument();
  });

  it('Issue #92 / AC2: attention card và bảng dùng chung 1 query duy nhất (không N+1 hay lặp request)', async () => {
    const t = setup('/admin');

    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    const codeElements = await screen.findAllByText('ORD-ATTN-001');
    expect(codeElements.length).toBeGreaterThan(0);

    // Kiểm tra số request gửi tới /api/admin/orders?attention=true
    const attentionRequests = t.requests.filter(
      (r) =>
        r.url.pathname === '/api/admin/orders' && r.url.searchParams.get('attention') === 'true',
    );
    expect(attentionRequests).toHaveLength(1);
    expect(attentionRequests[0].url.searchParams.get('pageSize')).toBe('5');
    expect(attentionRequests[0].url.searchParams.get('page')).toBe('1');

    // Bảng hiển thị thông tin đơn
    expect(screen.getByRole('link', { name: 'Mở danh sách' })).toHaveAttribute(
      'href',
      '/admin/orders?tab=attention',
    );
    expect(screen.getAllByRole('link', { name: 'Chi tiết' })[0]).toHaveAttribute(
      'href',
      '/admin/orders/ord-1',
    );
  });

  it('Issue #92 / AC3: bảng tồn thấp hiển thị dữ liệu từ endpoint low-stock và liên kết mở tồn kho', async () => {
    setup('/admin');

    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    const skuElements = await screen.findAllByText('SKU-LOW-001');
    expect(skuElements.length).toBeGreaterThan(0);

    expect(screen.getByText(/Khả dụng từ 0 đến 5, gồm biến thể ngừng bán/)).toBeInTheDocument();
    expect(screen.getAllByText(/Áo Thun Cotton · Đen \/ M/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Mở tồn kho' })).toHaveAttribute(
      'href',
      '/admin/inventory',
    );
    expect(screen.getAllByRole('link', { name: 'Xem kho' })[0]).toHaveAttribute(
      'href',
      '/admin/inventory/var-1',
    );
  });

  it('Issue #92 / AC4: partial error: một khối 500 không làm hỏng các khối khác; hiển thị "— Không tải được"', async () => {
    setup('/admin', actor, (url) => {
      if (url.pathname === '/api/admin/users') return error(500);
      return undefined;
    });

    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });

    // Khối users lỗi: hiện "— Không tải được", không biến thành 0
    await screen.findByText('— Không tải được');
    expect(screen.getByRole('button', { name: 'Thử lại tải Người dùng' })).toBeInTheDocument();

    // Các khối khác vẫn hoạt động bình thường
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
    expect(screen.getAllByText('ORD-ATTN-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKU-LOW-001').length).toBeGreaterThan(0);

    // Kiểm tra cấu trúc DOM: không có button lồng trong thẻ a (accessibility/semantic)
    expect(document.querySelector('a button, button a')).toBeNull();

    // Link mở trang và nút Thử lại là anh em (sibling), nút retry không điều hướng
    const retryBtn = screen.getByRole('button', { name: 'Thử lại tải Người dùng' });
    const userLink = screen.getByRole('link', { name: 'Mở danh sách Người dùng' });
    expect(userLink).toHaveAttribute('href', '/admin/users');
    expect(retryBtn.closest('a')).toBeNull();
  });

  it('Issue #92 / AC5: mất quyền 403 ở bất kỳ khối nào dọn sạch admin cache của actor và ẩn toàn trang, response sibling muộn không hồi phục cache', async () => {
    const d = deferred<Response>();
    const usersGate = deferred<void>();
    let deferredWasHit = false;

    const t = setup('/admin', actor, (url) => {
      // Orders request (không có attention) là request đếm tổng đơn hàng, bị hoãn
      if (url.pathname === '/api/admin/orders' && !url.searchParams.has('attention')) {
        deferredWasHit = true;
        usersGate.resolve(); // Đảm bảo orders request đã bắt đầu pending trước khi users trả 403
        return d.promise;
      }
      // Users đợi orders request bắt đầu xong mới phát 403
      if (url.pathname === '/api/admin/users') {
        return usersGate.promise.then(() => error(403));
      }
      return undefined;
    });

    // Mất quyền -> hiện AdminForbidden
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(screen.queryByRole('heading', { name: 'Tổng quan cửa hàng' })).not.toBeInTheDocument();

    // Khẳng định orders request thực sự đã được gọi và đang pending khi 403 xảy ra
    expect(deferredWasHit).toBe(true);

    // Cache admin của actor trước khi sibling 200 trả về phải sạch (mọi data đều undefined)
    const cachedBefore = t.client.getQueriesData({ queryKey: overviewKeys.all(actor.id) });
    expect(cachedBefore.every(([, data]) => data === undefined)).toBe(true);

    // Response sibling về muộn 200 không phục hồi dữ liệu hay làm hiện lại trang
    await act(async () => {
      d.resolve(reply(mockOrdersData));
    });

    // Sau khi resolve 200: UI vẫn hiển thị Không đủ quyền truy cập
    expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tổng quan cửa hàng' })).not.toBeInTheDocument();

    // Cache vẫn hoàn toàn sạch, không nhận dữ liệu orders muộn
    const cachedAfter = t.client.getQueriesData({ queryKey: overviewKeys.all(actor.id) });
    expect(cachedAfter.every(([, data]) => data === undefined)).toBe(true);
    expect(t.client.getQueryData(overviewKeys.orders(actor.id))).toBeUndefined();
  });

  it('Issue #92 / AC6: nút "Làm mới" refetch dữ liệu, chống click lặp khi đang chạy', async () => {
    let usersCalls = 0;
    const gate = deferred<Response>();

    setup('/admin', actor, (url) => {
      if (url.pathname === '/api/admin/users') {
        usersCalls++;
        if (usersCalls > 1) return gate.promise;
      }
      return undefined;
    });

    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    await screen.findByText('137');

    const refreshBtn = screen.getByRole('button', { name: 'Làm mới' });
    expect(refreshBtn).not.toBeDisabled();

    // Bấm Làm mới
    fireEvent.click(refreshBtn);

    // Nút chuyển thành Đang làm mới… và bị vô hiệu hóa
    expect(screen.getByRole('button', { name: 'Đang làm mới…' })).toBeDisabled();

    // Thử click lần nữa không tạo thêm request
    fireEvent.click(screen.getByRole('button', { name: 'Đang làm mới…' }));
    expect(usersCalls).toBe(2);

    // Giải phóng promise
    await act(async () => {
      gate.resolve(reply({ items: [], total: 138 }));
    });

    // Hoàn thành làm mới -> hiển thị giá trị mới
    await screen.findByText('138');
    expect(screen.getByRole('button', { name: 'Làm mới' })).not.toBeDisabled();
  });

  it('Issue #92 / AC7: trạng thái rỗng và total = 0 hiển thị số 0 chứ không phải rỗng hay lỗi', async () => {
    setup('/admin', actor, (url) => {
      if (url.pathname === '/api/admin/users') return reply({ items: [], total: 0 });
      if (url.pathname === '/api/admin/products') return reply({ items: [], total: 0 });
      if (url.pathname === '/api/admin/orders') {
        return reply({ items: [], total: 0 });
      }
      if (url.pathname === '/api/admin/inventory/low-stock') {
        return reply({ items: [], total: 0, threshold: 5, asOf: '2026-11-11T00:00:00.000Z' });
      }
      return undefined;
    });

    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });

    // Cả 4 KPI đều hiển thị 0
    await waitFor(() => {
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(4);
    });

    // Thông báo rỗng ở 2 panel
    expect(screen.getByText('Không có đơn hàng cần xử lý.')).toBeInTheDocument();
    expect(screen.getByText('Không có biến thể tồn thấp.')).toBeInTheDocument();
  });

  it('CODEX_REVIEW92: total orders query không gửi tham số tab lên máy chủ', async () => {
    const t = setup('/admin');
    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    await screen.findByText('89');

    const ordersRequests = t.requests.filter(
      (r) => r.url.pathname === '/api/admin/orders' && !r.url.searchParams.has('attention'),
    );
    expect(ordersRequests.length).toBeGreaterThan(0);
    // Tuyệt đối không gửi tab lên API vì ListAdminOrdersQuery không khai báo tab
    expect(ordersRequests[0].url.searchParams.has('tab')).toBe(false);
    expect(ordersRequests[0].url.searchParams.get('page')).toBe('1');
    expect(ordersRequests[0].url.searchParams.get('pageSize')).toBe('1');
  });

  it('guest bị chặn bởi RequireAdmin, CUSTOMER nhận 403 hiển thị AdminForbidden', async () => {
    // 1. Guest chưa đăng nhập
    setup('/admin', null);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
    });

    // 2. User có role CUSTOMER (không có role ADMIN)
    const customerUser: AuthenticatedUser = {
      id: 'c0000000-0000-4000-8000-000000000001',
      email: 'customer@example.test',
      roles: ['CUSTOMER'],
    };
    setup('/admin', customerUser);
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(screen.queryByRole('heading', { name: 'Tổng quan cửa hàng' })).not.toBeInTheDocument();
  });

  it('logout khi request đang chờ: signal bị hủy, response muộn không ghi vào cache phiên', async () => {
    const d = deferred<Response>();
    const t = setup('/admin', actor, (url) => {
      if (url.pathname === '/api/admin/users') return d.promise;
      return undefined;
    });

    await waitFor(() => {
      expect(t.requests.some((r) => r.url.pathname === '/api/admin/users')).toBe(true);
    });

    const userReq = t.requests.find((r) => r.url.pathname === '/api/admin/users')!;
    await act(async () => t.auth().logout());

    // AbortSignal của request bị kích hoạt do hủy phiên
    expect(userReq.init?.signal?.aborted).toBe(true);

    // Response muộn trả về không ghi đè vào cache phiên
    await act(async () => {
      d.resolve(reply(mockUsersData));
    });
    const cachedData = t.client.getQueriesData({ queryKey: overviewKeys.all(actor.id) });
    expect(cachedData.every(([, data]) => data === undefined)).toBe(true);
  });

  it('CODEX_REVIEW2: E2E heading selector must match actual overview component', async () => {
    const { readFileSync } = await import('node:fs');
    const e2e = readFileSync('e2e/admin-overview.spec.ts', 'utf8');
    const match = e2e.match(/getByRole\('heading', \{ [^}]*name: '([^']+)'/);
    expect(match).not.toBeNull();
    const expectedHeading = match![1];
    setup('/admin');
    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    expect(screen.queryByRole('heading', { name: expectedHeading })).not.toBeNull();
  });

  it('CODEX_REVIEW2: late sibling 403 test must actually defer orders request', async () => {
    let deferredWasHit = false;
    const gate = deferred<Response>();
    setup('/admin', actor, (url) => {
      if (url.pathname === '/api/admin/users') return error(403);
      if (url.pathname === '/api/admin/orders' && !url.searchParams.has('attention')) {
        deferredWasHit = true;
        return gate.promise;
      }
      return undefined;
    });
    await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' });
    expect(deferredWasHit).toBe(true);
  });

  it('CODEX_REVIEW3: E2E KPI locators scoped to KPI region must identify single links without matching sidebar', async () => {
    setup('/admin');
    await screen.findByRole('heading', { level: 1, name: 'Tổng quan cửa hàng' });
    const kpiSection = screen.getByRole('region', { name: 'Chỉ số hoạt động chính' });
    expect(within(kpiSection).getAllByRole('link', { name: /Người dùng/ })).toHaveLength(1);
    expect(within(kpiSection).getAllByRole('link', { name: /Sản phẩm/ })).toHaveLength(1);
    expect(within(kpiSection).getAllByRole('link', { name: /Đơn hàng/ })).toHaveLength(1);
    expect(within(kpiSection).getAllByRole('link', { name: /Cần xử lý/ })).toHaveLength(1);
  });
});
