import { timeoutManager } from '@tanstack/query-core';
import {
  type Query,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, StrictMode } from 'react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureUncertainQueryDefaults, isAdminQueryForActor } from '@/core';
import { AuthProvider, useAdminForbidden, useAuth } from '@/features/account';

import {
  type AdminPromotionDetail,
  type AdminPromotionListResponse,
  adminPromotionsKeys,
} from './admin-promotions.api.js';
import { AdminPromotionDetailPage } from './AdminPromotionDetailPage.js';
import { AdminPromotionNewPage } from './AdminPromotionNewPage.js';
import { AdminPromotionsPage } from './AdminPromotionsPage.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

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

const sampleSimplePromotion: AdminPromotionDetail = {
  id: 'a0000000-0000-4000-a000-000000000001',
  name: 'Khuyến mãi Mùa hè',
  discountType: 'PERCENTAGE',
  discountValue: '15.00',
  maxDiscountAmount: '100000.00',
  minOrderAmount: '200000.00',
  conditions: null,
  status: 'ACTIVE',
  startsAt: '2026-06-01T00:00:00.000Z',
  endsAt: '2026-08-31T23:59:59.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const sampleComplexPromotion: AdminPromotionDetail = {
  id: 'a0000000-0000-4000-a000-000000000002',
  name: 'Khuyến mãi VIP Đa tầng',
  discountType: 'PERCENTAGE',
  discountValue: '25.00',
  maxDiscountAmount: null,
  minOrderAmount: null,
  conditions: {
    type: 'CUSTOMER_SEGMENT',
    segment: 'VIP',
    tiers: [{ minSpent: 5000000, discount: 25 }],
  },
  status: 'ACTIVE',
  startsAt: null,
  endsAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function setupMockFetch(handlers: {
  getList?: (url: URL) => Response | Promise<Response>;
  getDetail?: (id: string) => Response | Promise<Response>;
  create?: (body: Record<string, unknown>) => Response | Promise<Response>;
  patch?: (id: string, body: Record<string, unknown>) => Response | Promise<Response>;
}) {
  const requests: { url: string; method: string; body?: unknown }[] = [];

  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    const url = new URL(urlStr, 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    requests.push({ url: urlStr, method, body });

    // Mock refresh endpoint for AuthProvider
    if (url.pathname === '/api/auth/refresh') {
      return new Response(
        JSON.stringify({
          user: { id: 'admin-1', email: 'admin@example.test', roles: ['ADMIN'] },
          accessToken: 'test-token',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === '/api/auth/login' && method === 'POST') {
      return new Response(
        JSON.stringify({
          user: { id: 'admin-2', email: 'admin2@example.test', roles: ['ADMIN'] },
          accessToken: 'test-token-2',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname === '/api/admin/promotions' && method === 'GET') {
      if (handlers.getList) return handlers.getList(url);
      const res: AdminPromotionListResponse = {
        items: [sampleSimplePromotion, sampleComplexPromotion],
        total: 2,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      };
      return new Response(JSON.stringify(res), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname.startsWith('/api/admin/promotions/') && method === 'GET') {
      const id = url.pathname.replace('/api/admin/promotions/', '');
      if (handlers.getDetail) return handlers.getDetail(id);
      if (id === sampleComplexPromotion.id) {
        return new Response(JSON.stringify(sampleComplexPromotion), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(sampleSimplePromotion), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/admin/promotions' && method === 'POST') {
      if (handlers.create) return handlers.create(body);
      return new Response(
        JSON.stringify({ ...sampleSimplePromotion, ...body, id: body.id ?? 'new-id' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url.pathname.startsWith('/api/admin/promotions/') && method === 'PATCH') {
      const id = url.pathname.replace('/api/admin/promotions/', '');
      if (handlers.patch) return handlers.patch(id, body);
      return new Response(
        JSON.stringify({
          ...sampleSimplePromotion,
          ...body,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  });

  vi.stubGlobal('fetch', mockFetch);
  return { requests };
}

function renderWithProviders(
  ui: ReactNode,
  initialRoute = '/admin/promotions',
  existingClient?: QueryClient,
) {
  const queryClient =
    existingClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 1000 * 60 * 5 },
        mutations: { retry: false },
      },
    });
  configureUncertainQueryDefaults(queryClient);

  const renderResult = render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );

  return {
    ...renderResult,
    queryClient,
  };
}

describe('Admin Promotions Web Feature (UC-10.1)', () => {
  it('hiển thị danh sách chiến dịch, phân biệt đơn giản và nâng cao (chỉ xem)', async () => {
    setupMockFetch({});

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
      </Routes>,
    );

    // Chờ danh sách tải xong
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Khuyến mãi Mùa hè')).toBeInTheDocument();
    expect(within(table).getByText('Khuyến mãi VIP Đa tầng')).toBeInTheDocument();

    // Huy hiệu Nâng cao (Chỉ xem)
    expect(within(table).getByText('Nâng cao (Chỉ xem)')).toBeInTheDocument();

    // Chiến dịch đơn giản có nút "Chi tiết" và "Ngưng"
    const simpleRow = within(table).getByText('Khuyến mãi Mùa hè').closest('tr')!;
    expect(within(simpleRow).getByRole('link', { name: 'Chi tiết' })).toBeInTheDocument();
    expect(within(simpleRow).getByRole('button', { name: 'Ngưng' })).toBeInTheDocument();

    // Chiến dịch phức tạp có nút "Xem" và KHÔNG có nút đổi trạng thái
    const complexRow = within(table).getByText('Khuyến mãi VIP Đa tầng').closest('tr')!;
    expect(within(complexRow).getByRole('link', { name: 'Xem' })).toBeInTheDocument();
    expect(within(complexRow).queryByRole('button', { name: 'Ngưng' })).not.toBeInTheDocument();
    expect(within(complexRow).queryByRole('button', { name: 'Kích hoạt' })).not.toBeInTheDocument();
  });

  it('tạo mới chiến dịch: mặc định INACTIVE, sinh UUID id và validate form', async () => {
    const { requests } = setupMockFetch({});
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
        <Route path="/admin/promotions/:id" element={<div>Trang chi tiết mới</div>} />
      </Routes>,
      '/admin/promotions/new',
    );

    expect(
      await screen.findByRole('heading', { name: 'Tạo chiến dịch khuyến mãi mới' }),
    ).toBeInTheDocument();

    // Kiểm tra mặc định trạng thái là INACTIVE
    const statusSelect = screen.getByLabelText('Trạng thái ban đầu') as HTMLSelectElement;
    expect(statusSelect.value).toBe('INACTIVE');

    // Thử submit form rỗng -> hiển thị lỗi validation
    await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));
    expect(await screen.findByText('Vui lòng nhập tên chương trình')).toBeInTheDocument();

    // Nhập đầy đủ thông tin hợp lệ
    await user.type(
      screen.getByLabelText(/Tên chương trình khuyến mãi/i),
      'Khuyến mãi Khai Xuân 2026',
    );
    await user.type(screen.getByLabelText(/Giá trị giảm/i), '20');
    await user.type(screen.getByLabelText(/Mức giảm tối đa/i), '100000');
    await user.type(screen.getByLabelText(/Đơn hàng tối thiểu/i), '500000');

    // Submit form
    await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));

    // Kiểm tra request POST tạo khuyến mãi được gửi lên với id là UUID v4
    await waitFor(() => {
      const postReq = requests.find(
        (r) => r.method === 'POST' && r.url.includes('/api/admin/promotions'),
      );
      expect(postReq).toBeDefined();
      const body = postReq!.body as Record<string, unknown>;
      expect(body.name).toBe('Khuyến mãi Khai Xuân 2026');
      expect(body.discountType).toBe('PERCENTAGE');
      expect(body.discountValue).toBe('20');
      expect(body.status).toBe('INACTIVE');
      // ID do client sinh phải là UUID v4 hợp lệ
      expect(body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    // Chuyển hướng thành công
    expect(await screen.findByText('Trang chi tiết mới')).toBeInTheDocument();
  });

  it('tạo mới gặp lỗi mạng/5xx: kích hoạt trạng thái uncertain và cho phép recheck', async () => {
    let _callCount = 0;
    setupMockFetch({
      create: () => {
        _callCount++;
        return new Response(JSON.stringify({ message: 'Internal Server Error' }), { status: 500 });
      },
      getDetail: () => {
        // Mock phản hồi của nút recheck khi máy chủ đã commit thành công
        return new Response(
          JSON.stringify({
            ...sampleSimplePromotion,
            name: 'Khuyến mãi Gặp lỗi',
            discountValue: '10',
            status: 'INACTIVE',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      },
    });

    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
        <Route path="/admin/promotions/:id" element={<div>Trang chi tiết sau recheck</div>} />
      </Routes>,
      '/admin/promotions/new',
    );

    await screen.findByRole('heading', { name: 'Tạo chiến dịch khuyến mãi mới' });

    await user.type(screen.getByLabelText(/Tên chương trình khuyến mãi/i), 'Khuyến mãi Gặp lỗi');
    await user.type(screen.getByLabelText(/Giá trị giảm/i), '10');

    await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));

    // Hiển thị banner chưa rõ kết quả và nút kiểm tra lại
    expect(await screen.findByText('Kết quả chưa được xác nhận')).toBeInTheDocument();
    const recheckBtn = screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' });
    expect(recheckBtn).toBeInTheDocument();

    // Bấm nút kiểm tra lại
    await user.click(recheckBtn);

    // Xác nhận máy chủ đã có bản ghi -> chuyển trang thành công
    expect(await screen.findByText('Trang chi tiết sau recheck')).toBeInTheDocument();
  });

  it('chi tiết chiến dịch phức tạp: hiển thị banner chỉ xem, vô hiệu hóa form và render JSON viewer', async () => {
    setupMockFetch({
      getDetail: () =>
        new Response(JSON.stringify(sampleComplexPromotion), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
      </Routes>,
      `/admin/promotions/${sampleComplexPromotion.id}`,
    );

    // Chờ tải chi tiết
    expect(
      await screen.findByRole('heading', { name: 'Khuyến mãi VIP Đa tầng' }),
    ).toBeInTheDocument();

    // Hiển thị cảnh báo Chế độ Chỉ xem
    expect(screen.getByText('Chế độ Chỉ xem (Read-only)')).toBeInTheDocument();
    expect(
      screen.getByText(/Chiến dịch này có cấu hình điều kiện nâng cao \(JsonB\)/),
    ).toBeInTheDocument();

    // Form inputs bị disabled
    expect(screen.getByLabelText(/Tên chương trình khuyến mãi/i)).toBeDisabled();
    expect(screen.getByLabelText(/Giá trị giảm/i)).toBeDisabled();

    // Không có nút Lưu thay đổi
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();

    // Render JSON viewer
    expect(screen.getByText(/CUSTOMER_SEGMENT/)).toBeInTheDocument();
    expect(screen.getByText(/tiers/)).toBeInTheDocument();
  });

  it('chi tiết chiến dịch đơn giản: gửi CAS expectedUpdatedAt và xử lý 409 conflict', async () => {
    let _patchCount = 0;
    setupMockFetch({
      getDetail: () =>
        new Response(JSON.stringify(sampleSimplePromotion), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      patch: () => {
        _patchCount++;
        // Trả về 409 Conflict cho lần sửa đầu tiên
        return new Response(
          JSON.stringify({
            statusCode: 409,
            message: 'Dữ liệu chương trình khuyến mãi đã bị thay đổi bởi phiên làm việc khác.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
      </Routes>,
      `/admin/promotions/${sampleSimplePromotion.id}`,
    );

    expect(await screen.findByDisplayValue('Khuyến mãi Mùa hè')).toBeInTheDocument();

    // Sửa tên chương trình
    const nameInput = screen.getByLabelText(/Tên chương trình khuyến mãi/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Khuyến mãi Mùa hè Rực rỡ');

    // Nút Lưu thay đổi được kích hoạt
    const saveBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(saveBtn).toBeEnabled();

    // Bấm Lưu
    await user.click(saveBtn);

    // Nhận 409 Conflict: Hiển thị thông báo xung đột và giữ nguyên bản thảo đang gõ
    expect(
      await screen.findByText(
        /Dữ liệu trên máy chủ đã thay đổi bởi phiên khác\. Bản thảo đang gõ được giữ nguyên\./,
      ),
    ).toBeInTheDocument();
    expect(nameInput).toHaveValue('Khuyến mãi Mùa hè Rực rỡ');
    expect(screen.getByRole('button', { name: 'Tải lại dữ liệu mới nhất' })).toBeInTheDocument();
  });

  it('hộp xác nhận bật/ngưng hoạt động chiến dịch: gửi expectedUpdatedAt và cập nhật giao diện', async () => {
    const { requests } = setupMockFetch({});
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
      </Routes>,
    );

    const table = await screen.findByRole('table');
    const simpleRow = within(table).getByText('Khuyến mãi Mùa hè').closest('tr')!;

    // Bấm nút "Ngưng" trên chiến dịch đang ACTIVE
    const toggleBtn = within(simpleRow).getByRole('button', { name: 'Ngưng' });
    await user.click(toggleBtn);

    // Hộp ConfirmDialog mở ra
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ngưng kích hoạt chiến dịch' })).toBeInTheDocument();
    expect(
      screen.getByText(/Các đơn hàng mới sẽ không còn được áp dụng mức giảm giá từ chiến dịch này/),
    ).toBeInTheDocument();

    // Bấm xác nhận "Ngưng kích hoạt"
    const confirmBtn = screen.getByRole('button', { name: 'Ngưng kích hoạt' });
    await user.click(confirmBtn);

    // Kiểm tra request PATCH được gửi đi kèm expectedUpdatedAt
    await waitFor(() => {
      const patchReq = requests.find(
        (r) => r.method === 'PATCH' && r.url.includes('/api/admin/promotions'),
      );
      expect(patchReq).toBeDefined();
      const body = patchReq!.body as Record<string, unknown>;
      expect(body.status).toBe('INACTIVE');
      expect(body.expectedUpdatedAt).toBe(sampleSimplePromotion.updatedAt);
    });

    // Thông báo thành công hiển thị
    expect(
      await screen.findByText(/Đã ngưng chiến dịch "Khuyến mãi Mùa hè" thành công\./),
    ).toBeInTheDocument();
  });

  describe('CODEX_REVIEW campaign88 regressions', () => {
    function ReviewRefresh() {
      const client = useQueryClient();
      return (
        <button
          onClick={() =>
            void client.invalidateQueries({ queryKey: ['session', 'admin', 'promotions'] })
          }
        >
          Review refresh
        </button>
      );
    }

    it('CODEX_REVIEW unresolved create must stay locked after leaving and returning', async () => {
      setupMockFetch({
        create: () => new Response(JSON.stringify({ message: 'Uncertain' }), { status: 500 }),
      });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
          <Route
            path="/admin/promotions"
            element={<Link to="/admin/promotions/new">Mở lại form</Link>}
          />
        </Routes>,
        '/admin/promotions/new',
      );
      await screen.findByLabelText(/Tên chương trình khuyến mãi/);
      await user.type(screen.getByLabelText(/Tên chương trình khuyến mãi/), 'Campaign Pending');
      await user.type(screen.getByLabelText(/Giá trị giảm/), '10');
      await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));
      await screen.findByText('Kết quả chưa được xác nhận');
      await user.click(screen.getByRole('link', { name: 'Khuyến mãi' }));
      await user.click(screen.getByRole('link', { name: 'Mở lại form' }));
      expect(screen.getByRole('button', { name: 'Lưu chiến dịch' })).toBeDisabled();
    });

    it('CODEX_REVIEW edit 500 must block repeat write pending reconciliation', async () => {
      setupMockFetch({
        patch: () => new Response(JSON.stringify({ message: 'Uncertain write' }), { status: 500 }),
      });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
        </Routes>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );
      const input = await screen.findByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '55');
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await screen.findByText('Uncertain write');
      expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
    });

    it('CODEX_REVIEW conflict must not disappear on second refetch of unrelated field', async () => {
      let fresh = { ...sampleSimplePromotion };
      let _reads = 0;
      const { requests } = setupMockFetch({
        getDetail: () => {
          _reads++;
          return new Response(JSON.stringify(fresh), { status: 200 });
        },
      });
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <ReviewRefresh />
          <Routes>
            <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
          </Routes>
        </>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );
      const input = await screen.findByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '99');
      fresh = { ...fresh, discountValue: '30.00', updatedAt: '2026-11-11T00:00:00.001Z' };
      await user.click(screen.getByRole('button', { name: 'Review refresh' }));
      await screen.findByText(/Một số trường bạn đang chỉnh sửa/);
      fresh = { ...fresh, name: 'Server renamed', updatedAt: '2026-11-11T00:00:00.002Z' };
      await user.click(screen.getByRole('button', { name: 'Review refresh' }));
      await screen.findAllByText('Server renamed');
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(requests.some((r) => r.method === 'PATCH')).toBe(true));
      const sent = requests.find((r) => r.method === 'PATCH')!.body as Record<string, unknown>;
      expect(sent.expectedUpdatedAt).toBe(sampleSimplePromotion.updatedAt);
    });

    it('CODEX_REVIEW URL preservation: link sang new và detail giữ returnTo đúng tham số danh sách', async () => {
      setupMockFetch({});
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
        </Routes>,
        '/admin/promotions?page=2&pageSize=12',
      );

      const createLink = await screen.findByRole('link', { name: '+ Tạo chiến dịch' });
      expect(createLink).toHaveAttribute(
        'href',
        expect.stringContaining('returnTo=%2Fadmin%2Fpromotions%3Fpage%3D2%26pageSize%3D12'),
      );

      const table = await screen.findByRole('table');
      const detailLink = within(table).getByRole('link', { name: 'Chi tiết' });
      expect(detailLink).toHaveAttribute(
        'href',
        expect.stringContaining('returnTo=%2Fadmin%2Fpromotions%3Fpage%3D2%26pageSize%3D12'),
      );
    });

    it('CODEX_REVIEW deferred GET muộn không ghi đè trạng thái sau mutation', async () => {
      let resolveSlowGet: (value: Response) => void;
      const slowGetPromise = new Promise<Response>((resolve) => {
        resolveSlowGet = resolve;
      });

      let getCallCount = 0;
      setupMockFetch({
        getDetail: () => {
          getCallCount++;
          if (getCallCount === 2) {
            return slowGetPromise;
          }
          return new Response(JSON.stringify(sampleSimplePromotion), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
        patch: (_id, body) =>
          new Response(
            JSON.stringify({
              ...sampleSimplePromotion,
              ...body,
              name: 'Đã đổi tên qua PATCH',
              updatedAt: '2026-11-11T00:00:00.005Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      });

      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
        </Routes>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );

      const nameInput = await screen.findByLabelText(/Tên chương trình khuyến mãi/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Đã đổi tên qua PATCH');

      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      expect(await screen.findByText('Đã cập nhật chiến dịch thành công.')).toBeInTheDocument();

      // Giải phóng GET chậm sau khi PATCH đã hoàn tất
      resolveSlowGet!(
        new Response(JSON.stringify({ ...sampleSimplePromotion, name: 'Tên cũ từ GET chậm' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      // Tên hiển thị vẫn phải là tên sau PATCH, không bị GET chậm ghi đè
      expect(screen.getByDisplayValue('Đã đổi tên qua PATCH')).toBeInTheDocument();
    });
  });

  describe('CODEX_REVIEW2 campaign88', () => {
    it('CODEX_REVIEW2 recheck404 after remount must not release unknown create identity', async () => {
      setupMockFetch({
        create: () => new Response(JSON.stringify({ message: 'Uncertain' }), { status: 500 }),
        getDetail: () =>
          new Response(
            JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: 'Not visible yet' }),
            { status: 404 },
          ),
      });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
          <Route
            path="/admin/promotions"
            element={<Link to="/admin/promotions/new">Mở lại form</Link>}
          />
        </Routes>,
        '/admin/promotions/new',
      );
      await screen.findByLabelText(/Tên chương trình khuyến mãi/);
      await user.type(screen.getByLabelText(/Tên chương trình khuyến mãi/), 'Campaign Pending');
      await user.type(screen.getByLabelText(/Giá trị giảm/), '10');
      await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));
      await screen.findByText('Kết quả chưa được xác nhận');
      await user.click(screen.getByRole('link', { name: 'Khuyến mãi' }));
      await user.click(screen.getByRole('link', { name: 'Mở lại form' }));
      await user.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
      await screen.findByText(/Máy chủ chưa nhận được yêu cầu trước/);
      expect(screen.getByRole('button', { name: 'Lưu chiến dịch' })).toBeDisabled();
    });

    it('CODEX_REVIEW2 status 500 must keep status writes locked until reconciled', async () => {
      setupMockFetch({
        patch: () =>
          new Response(JSON.stringify({ message: 'Uncertain status write' }), { status: 500 }),
      });
      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
        </Routes>,
      );
      const table = await screen.findByRole('table');
      const row = within(table).getByText('Khuyến mãi Mùa hè').closest('tr')!;
      await user.click(within(row).getByRole('button', { name: 'Ngưng' }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Ngưng kích hoạt' }),
      );
      await screen.findByText('Uncertain status write');
      expect(within(row).getByRole('button', { name: 'Ngưng' })).toBeDisabled();
    });
  });

  describe('CODEX_REVIEW3 campaign88 marker GC lifecycle', () => {
    interface GcTask {
      fn: () => void;
      ms: number;
      cancelled: boolean;
    }

    function installGcInterceptor(gcTasks: GcTask[]) {
      timeoutManager.setTimeoutProvider({
        setTimeout(fn, ms) {
          const task: GcTask = { fn, ms, cancelled: false };
          gcTasks.push(task);
          return task as unknown as number;
        },
        clearTimeout(task: unknown) {
          if (task && typeof task === 'object' && 'cancelled' in task) {
            (task as GcTask).cancelled = true;
          }
        },
        setInterval: (cb, delay) => setInterval(cb, delay) as unknown as number,
        clearInterval: () => {},
      });
    }

    function restoreGcInterceptor() {
      timeoutManager.setTimeoutProvider({
        setTimeout: (cb, delay) => setTimeout(cb, delay),
        clearTimeout: (id) => clearTimeout(id as number | undefined),
        setInterval: (cb, delay) => setInterval(cb, delay),
        clearInterval: (id) => clearInterval(id as number | undefined),
      });
    }

    it('CODEX_REVIEW3 create marker must survive past gcTime when unmounted and clear on reconcile', async () => {
      const gcTasks: GcTask[] = [];
      installGcInterceptor(gcTasks);

      let checkAttempt = 0;
      try {
        setupMockFetch({
          create: () =>
            new Response(JSON.stringify({ message: 'Uncertain create' }), { status: 500 }),
          getDetail: (id) => {
            checkAttempt++;
            if (checkAttempt === 1) {
              return new Response(
                JSON.stringify({ statusCode: 404, code: 'NOT_FOUND', message: 'Not yet visible' }),
                { status: 404 },
              );
            }
            return new Response(
              JSON.stringify({
                ...sampleSimplePromotion,
                id,
                name: 'Campaign Pending GC',
                discountType: 'PERCENTAGE',
                discountValue: '10.00',
                maxDiscountAmount: null,
                minOrderAmount: null,
                status: 'INACTIVE',
                startsAt: null,
                endsAt: null,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          },
        });
        const user = userEvent.setup();
        const { queryClient } = renderWithProviders(
          <Routes>
            <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
            <Route
              path="/admin/promotions/:id"
              element={<div data-testid="detail-page">Trang chi tiết</div>}
            />
            <Route
              path="/admin/promotions"
              element={<Link to="/admin/promotions/new">Mở lại form</Link>}
            />
          </Routes>,
          '/admin/promotions/new',
        );

        await screen.findByLabelText(/Tên chương trình khuyến mãi/);
        await user.type(
          screen.getByLabelText(/Tên chương trình khuyến mãi/),
          'Campaign Pending GC',
        );
        await user.type(screen.getByLabelText(/Giá trị giảm/), '10');
        await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));
        await screen.findByText('Kết quả chưa được xác nhận');

        // Form has uncertain marker
        const queries = queryClient.getQueryCache().getAll();
        const uncertainQuery = queries.find((q) => q.queryKey.some((k) => k === 'uncertain'));
        expect(uncertainQuery).toBeDefined();
        expect(uncertainQuery?.gcTime).toBe(Infinity);

        // Rời trang (unmount form, 0 observer)
        await user.click(screen.getByRole('link', { name: 'Khuyến mãi' }));
        expect(screen.getByRole('link', { name: 'Mở lại form' })).toBeInTheDocument();

        // Kích hoạt callback GC 5 phút (300000ms)
        for (const task of gcTasks) {
          if (!task.cancelled && task.ms === 300000) {
            task.fn();
          }
        }

        // Mở lại form
        await user.click(screen.getByRole('link', { name: 'Mở lại form' }));

        // Nút lưu vẫn bị khóa và dữ liệu vẫn còn nguyên
        expect(screen.getByRole('button', { name: 'Lưu chiến dịch' })).toBeDisabled();
        expect(screen.getByDisplayValue('Campaign Pending GC')).toBeInTheDocument();

        // Lần kiểm tra 1: 404 -> marker và khóa vẫn được giữ
        await user.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
        expect(await screen.findByText(/Máy chủ chưa nhận được yêu cầu trước/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lưu chiến dịch' })).toBeDisabled();

        // Lần kiểm tra 2: 200 khớp -> dọn marker và điều hướng sang trang chi tiết
        await user.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
        expect(await screen.findByTestId('detail-page')).toBeInTheDocument();
        const remainingMarker = queryClient
          .getQueryCache()
          .findAll({ queryKey: ['uncertain', 'admin', 'promotions'] });
        expect(remainingMarker.filter((q) => Boolean(q.state.data)).length).toBe(0);
      } finally {
        restoreGcInterceptor();
      }
    });

    it('CODEX_REVIEW3 edit marker must survive past gcTime when unmounted and clear on reconcile', async () => {
      const gcTasks: GcTask[] = [];
      installGcInterceptor(gcTasks);

      let recheckCount = 0;
      try {
        setupMockFetch({
          patch: () =>
            new Response(JSON.stringify({ message: 'Uncertain edit write' }), { status: 500 }),
          getDetail: () => {
            if (recheckCount === 2) {
              return new Response(
                JSON.stringify({
                  ...sampleSimplePromotion,
                  name: 'Tên mới sau đối chiếu',
                  updatedAt: '2026-11-11T00:00:00.010Z',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              );
            }
            return new Response(JSON.stringify(sampleSimplePromotion), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        });
        const user = userEvent.setup();
        const { queryClient } = renderWithProviders(
          <Routes>
            <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
            <Route
              path="/admin/promotions"
              element={
                <Link to={`/admin/promotions/${sampleSimplePromotion.id}`}>Mở lại chi tiết</Link>
              }
            />
          </Routes>,
          `/admin/promotions/${sampleSimplePromotion.id}`,
        );

        const nameInput = await screen.findByLabelText(/Tên chương trình khuyến mãi/i);
        await user.clear(nameInput);
        await user.type(nameInput, 'Tên mới sau đối chiếu');
        await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

        expect(await screen.findByText('Uncertain edit write')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();

        // Kiểm tra gcTime của edit marker query
        const uncertainQuery = queryClient.getQueryCache().find({
          queryKey: adminPromotionsKeys.uncertainMarker(
            'admin-1',
            'edit',
            sampleSimplePromotion.id,
          ),
        });
        expect(uncertainQuery).toBeDefined();
        expect(uncertainQuery?.gcTime).toBe(Infinity);

        // Rời trang (unmount)
        await user.click(screen.getByRole('link', { name: 'Khuyến mãi' }));
        expect(screen.getByRole('link', { name: 'Mở lại chi tiết' })).toBeInTheDocument();

        // Kích hoạt callback GC 5 phút (300000ms)
        for (const task of gcTasks) {
          if (!task.cancelled && task.ms === 300000) {
            task.fn();
          }
        }

        // Mở lại chi tiết
        await user.click(screen.getByRole('link', { name: 'Mở lại chi tiết' }));

        // Form vẫn bị khóa, banner đối chiếu vẫn còn
        expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' })).toBeInTheDocument();

        // Lần kiểm tra 1: server trả data cũ -> chưa khớp payload, khóa tiếp tục giữ
        recheckCount = 1;
        await user.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
        expect(
          await screen.findByText(/Máy chủ chưa ghi nhận thay đổi của bạn/),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled();

        // Lần kiểm tra 2: server trả data mới khớp payload -> dọn marker, mở khóa
        recheckCount = 2;
        await user.click(screen.getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
        expect(
          await screen.findByText('Đã đối chiếu thành công: Thay đổi đã được lưu trên máy chủ.'),
        ).toBeInTheDocument();
        expect(
          queryClient.getQueryData(
            adminPromotionsKeys.uncertainMarker('admin-1', 'edit', sampleSimplePromotion.id),
          ),
        ).toBeNull();
      } finally {
        restoreGcInterceptor();
      }
    });

    it('CODEX_REVIEW3 status toggle marker must survive past gcTime in list and detail', async () => {
      const gcTasks: GcTask[] = [];
      installGcInterceptor(gcTasks);

      try {
        setupMockFetch({
          patch: () =>
            new Response(JSON.stringify({ message: 'Uncertain status write' }), { status: 500 }),
        });
        const user = userEvent.setup();
        const { queryClient } = renderWithProviders(
          <Routes>
            <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
          </Routes>,
        );
        const table = await screen.findByRole('table');
        const row = within(table).getByText('Khuyến mãi Mùa hè').closest('tr')!;
        await user.click(within(row).getByRole('button', { name: 'Ngưng' }));
        await user.click(
          within(screen.getByRole('dialog')).getByRole('button', { name: 'Ngưng kích hoạt' }),
        );
        await screen.findByText('Uncertain status write');
        expect(within(row).getByRole('button', { name: 'Ngưng' })).toBeDisabled();

        // Marker status có gcTime Infinity
        const statusQuery = queryClient.getQueryCache().find({
          queryKey: adminPromotionsKeys.uncertainMarker(
            'admin-1',
            'status',
            sampleSimplePromotion.id,
          ),
        });
        expect(statusQuery).toBeDefined();
        expect(statusQuery?.gcTime).toBe(Infinity);

        // Chạy timer GC 5 phút
        for (const task of gcTasks) {
          if (!task.cancelled && task.ms === 300000) {
            task.fn();
          }
        }

        // Sau 5 phút, nút thao tác trên hàng vẫn phải bị vô hiệu hóa
        expect(within(row).getByRole('button', { name: 'Ngưng' })).toBeDisabled();
      } finally {
        restoreGcInterceptor();
      }
    });

    it('CODEX_REVIEW3 403 and logout only clean up uncertain markers of target actor', async () => {
      const client = new QueryClient({
        defaultOptions: { queries: { gcTime: 1000 * 60 * 5, retry: false } },
      });
      configureUncertainQueryDefaults(client);

      const actor1Create = adminPromotionsKeys.uncertainMarker('actor-1', 'create', 'new');
      const actor1Edit = adminPromotionsKeys.uncertainMarker('actor-1', 'edit', 'promo-1');
      const actor1Status = adminPromotionsKeys.uncertainMarker('actor-1', 'status', 'promo-1');

      const actor2Create = adminPromotionsKeys.uncertainMarker('actor-2', 'create', 'new');
      const actor2Edit = adminPromotionsKeys.uncertainMarker('actor-2', 'edit', 'promo-2');
      const actor2Status = adminPromotionsKeys.uncertainMarker('actor-2', 'status', 'promo-2');

      client.setQueryData(actor1Create, { id: 'uuid-1', payload: { name: 'Actor 1 promo' } });
      client.setQueryData(actor1Edit, { id: 'promo-1', payload: { name: 'Actor 1 edited' } });
      client.setQueryData(actor1Status, { id: 'promo-1', nextStatus: 'INACTIVE' });

      client.setQueryData(actor2Create, { id: 'uuid-2', payload: { name: 'Actor 2 promo' } });
      client.setQueryData(actor2Edit, { id: 'promo-2', payload: { name: 'Actor 2 edited' } });
      client.setQueryData(actor2Status, { id: 'promo-2', nextStatus: 'ACTIVE' });

      expect(client.getQueryData(actor1Create)).not.toBeNull();
      expect(client.getQueryData(actor2Create)).not.toBeNull();

      // Khi xảy ra 403 đối với actor-1 (gọi predicate isAdminQueryForActor):
      const filters = {
        predicate: (query: Query) => isAdminQueryForActor(query, 'actor-1'),
      };
      client.removeQueries(filters);

      // Actor 1 markers bị dọn sạch
      expect(client.getQueryData(actor1Create)).toBeUndefined();
      expect(client.getQueryData(actor1Edit)).toBeUndefined();
      expect(client.getQueryData(actor1Status)).toBeUndefined();

      // Actor 2 markers vẫn còn nguyên vẹn
      expect(client.getQueryData(actor2Create)).toEqual({
        id: 'uuid-2',
        payload: { name: 'Actor 2 promo' },
      });
      expect(client.getQueryData(actor2Edit)).toEqual({
        id: 'promo-2',
        payload: { name: 'Actor 2 edited' },
      });
      expect(client.getQueryData(actor2Status)).toEqual({ id: 'promo-2', nextStatus: 'ACTIVE' });

      // Khi đăng xuất toàn bộ: xóa mọi query prefix ['uncertain']
      client.removeQueries({ queryKey: ['uncertain'] });

      expect(client.getQueryData(actor2Create)).toBeUndefined();
      expect(client.getQueryData(actor2Edit)).toBeUndefined();
      expect(client.getQueryData(actor2Status)).toBeUndefined();
    });
  });

  describe('CODEX_REVIEW4 admin-promotions-forbidden-url regressions', () => {
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="location-display">{location.pathname + location.search}</div>;
    }

    function NavTester() {
      const navigate = useNavigate();
      return (
        <div>
          <button type="button" onClick={() => navigate('/admin/promotions?page=invalid&keep=1')}>
            Go Invalid
          </button>
          <button type="button" onClick={() => navigate('/admin/promotions?page=2&keep=1')}>
            Go Page 2
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Go Back
          </button>
          <button type="button" onClick={() => navigate(1)}>
            Go Forward
          </button>
        </div>
      );
    }

    function RevokeTrigger() {
      const { user, getSessionEpoch } = useAuth();
      const { markForbidden } = useAdminForbidden(user?.id ?? '', getSessionEpoch);
      return (
        <button type="button" onClick={() => markForbidden()}>
          Revoke Permission
        </button>
      );
    }

    function SessionSwitcher() {
      const { user, logout, login } = useAuth();
      const handleSwitch = async () => {
        await logout();
        await login({ email: 'admin2@example.test', password: 'Password123' });
      };
      return (
        <div>
          <span data-testid="active-actor">{user?.id ?? 'none'}</span>
          <button type="button" onClick={() => void handleSwitch()}>
            Switch User
          </button>
        </div>
      );
    }

    it('GET list trả 403: hiển thị AdminForbidden trên trang danh sách', async () => {
      setupMockFetch({
        getList: () =>
          new Response(
            JSON.stringify({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Không đủ quyền truy cập',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      });

      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
        </Routes>,
      );

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('GET detail trả 403: hiển thị AdminForbidden trên trang chi tiết', async () => {
      setupMockFetch({
        getDetail: () =>
          new Response(
            JSON.stringify({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Không đủ quyền truy cập',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      });

      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
        </Routes>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Tên chương trình khuyến mãi/)).not.toBeInTheDocument();
    });

    it('POST trả 403: chuyển sang hiển thị AdminForbidden trên trang tạo mới', async () => {
      setupMockFetch({
        create: () =>
          new Response(
            JSON.stringify({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Không đủ quyền truy cập',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      });

      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
        </Routes>,
        '/admin/promotions/new',
      );

      const nameInput = screen.getByLabelText(/Tên chương trình/);
      const discountInput = screen.getByLabelText(/Giá trị giảm/);
      await user.type(nameInput, 'Chiến dịch mới');
      await user.type(discountInput, '20');

      await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
    });

    it('PATCH trả 403: chuyển sang hiển thị AdminForbidden trên trang chi tiết', async () => {
      setupMockFetch({
        patch: () =>
          new Response(
            JSON.stringify({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Không đủ quyền truy cập',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
      });

      const user = userEvent.setup();
      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
        </Routes>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );

      const input = await screen.findByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '50');

      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
    });

    it('mất quyền ở màn khác khi form tạo đang mở: hiển thị AdminForbidden', async () => {
      setupMockFetch({});
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <RevokeTrigger />
          <Routes>
            <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
          </Routes>
        </>,
        '/admin/promotions/new',
      );

      expect(
        screen.getByRole('heading', { name: 'Tạo chiến dịch khuyến mãi mới' }),
      ).toBeInTheDocument();

      // Mất quyền ở nơi khác
      await user.click(screen.getByRole('button', { name: 'Revoke Permission' }));

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Tên chương trình/)).not.toBeInTheDocument();
    });

    it('response PATCH đến muộn sau 403 không phục hồi dữ liệu UI hay QueryClient (detail/list/uncertain)', async () => {
      let markPatchStarted!: () => void;
      const patchStarted = new Promise<void>((resolve) => {
        markPatchStarted = resolve;
      });
      let resolvePatch!: (res: Response) => void;
      const patchPromise = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });

      setupMockFetch({
        patch: () => {
          markPatchStarted();
          return patchPromise;
        },
      });

      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(
        <>
          <RevokeTrigger />
          <Routes>
            <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
          </Routes>
        </>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );

      const input = await screen.findByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '75');

      // Bắt đầu submit và đợi gate xác nhận PATCH đang pending
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await patchStarted;

      // Trong lúc request đang bay, mất quyền 403 ở nơi khác
      await user.click(screen.getByRole('button', { name: 'Revoke Permission' }));

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();

      // Sau đó mutation trả về thành công 200
      await act(async () => {
        resolvePatch(
          new Response(
            JSON.stringify({
              ...sampleSimplePromotion,
              discountValue: '75.00',
              updatedAt: '2026-11-13T00:00:00.000Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        await new Promise((r) => setTimeout(r, 50));
      });

      // Kiểm UI: không hiển thị thông báo thành công, không phục hồi form, giữ nguyên AdminForbidden
      expect(screen.queryByText('Đã cập nhật chiến dịch thành công.')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Giá trị giảm/)).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();

      // Kiểm QueryClient: không phục hồi detail, list hay uncertain marker
      expect(
        queryClient.getQueryData(adminPromotionsKeys.detail('admin-1', sampleSimplePromotion.id)),
      ).toBeUndefined();
      expect(
        queryClient.getQueryCache().findAll({ queryKey: adminPromotionsKeys.lists('admin-1') }),
      ).toHaveLength(0);
      expect(
        queryClient.getQueryData(
          adminPromotionsKeys.uncertainMarker('admin-1', 'edit', sampleSimplePromotion.id),
        ),
      ).toBeUndefined();
    });

    it('response POST đến muộn sau 403 không phục hồi dữ liệu UI hay QueryClient', async () => {
      let markCreateStarted!: () => void;
      const createStarted = new Promise<void>((resolve) => {
        markCreateStarted = resolve;
      });
      let resolveCreate!: (res: Response) => void;
      const createPromise = new Promise<Response>((resolve) => {
        resolveCreate = resolve;
      });

      setupMockFetch({
        create: () => {
          markCreateStarted();
          return createPromise;
        },
      });

      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(
        <>
          <RevokeTrigger />
          <Routes>
            <Route path="/admin/promotions/new" element={<AdminPromotionNewPage />} />
            <Route
              path="/admin/promotions/:id"
              element={<div data-testid="navigated-detail">Trang chi tiết</div>}
            />
          </Routes>
        </>,
        '/admin/promotions/new',
      );

      await user.type(screen.getByLabelText(/Tên chương trình/), 'Chiến dịch đến muộn');
      await user.type(screen.getByLabelText(/Giá trị giảm/), '25');

      // Gate xác nhận POST đã pending trước khi mất quyền
      await user.click(screen.getByRole('button', { name: 'Lưu chiến dịch' }));
      await createStarted;

      await user.click(screen.getByRole('button', { name: 'Revoke Permission' }));
      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();

      // Giải phóng response 201 muộn
      await act(async () => {
        resolveCreate(
          new Response(
            JSON.stringify({
              ...sampleSimplePromotion,
              id: 'created-late-id',
              name: 'Chiến dịch đến muộn',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        await new Promise((r) => setTimeout(r, 50));
      });

      // UI không chuyển hướng sang detail, không mất AdminForbidden
      expect(screen.queryByTestId('navigated-detail')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();

      // QueryClient không có detail, list hay uncertain marker được ghi cho admin-1
      expect(
        queryClient.getQueryData(adminPromotionsKeys.detail('admin-1', 'created-late-id')),
      ).toBeUndefined();
      expect(
        queryClient.getQueryCache().findAll({ queryKey: adminPromotionsKeys.lists('admin-1') }),
      ).toHaveLength(0);
      expect(queryClient.getQueryCache().findAll({ queryKey: ['uncertain'] })).toHaveLength(0);
    });

    it('response PATCH đến muộn sau khi đổi phiên thật (logout -> login admin-2) không phục hồi dữ liệu UI hay QueryClient', async () => {
      let markPatchStarted!: () => void;
      const patchStarted = new Promise<void>((resolve) => {
        markPatchStarted = resolve;
      });
      let resolvePatch!: (res: Response) => void;
      const patchPromise = new Promise<Response>((resolve) => {
        resolvePatch = resolve;
      });

      setupMockFetch({
        patch: () => {
          markPatchStarted();
          return patchPromise;
        },
      });

      const user = userEvent.setup();
      const { queryClient } = renderWithProviders(
        <>
          <SessionSwitcher />
          <Routes>
            <Route path="/admin/promotions/:id" element={<AdminPromotionDetailPage />} />
          </Routes>
        </>,
        `/admin/promotions/${sampleSimplePromotion.id}`,
      );

      const input = await screen.findByLabelText(/Giá trị giảm/);
      expect(screen.getByTestId('active-actor')).toHaveTextContent('admin-1');

      await user.clear(input);
      await user.type(input, '75');

      // Gate xác nhận PATCH của admin-1 đang pending
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await patchStarted;

      // Đổi phiên thật từ admin-1 sang admin-2 trong lúc PATCH đang bay
      await user.click(screen.getByRole('button', { name: 'Switch User' }));
      await waitFor(() => {
        expect(screen.getByTestId('active-actor')).toHaveTextContent('admin-2');
      });

      // Giải phóng PATCH response muộn của admin-1
      await act(async () => {
        resolvePatch(
          new Response(
            JSON.stringify({
              ...sampleSimplePromotion,
              discountValue: '75.00',
              updatedAt: '2026-11-13T00:00:00.000Z',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
        await new Promise((r) => setTimeout(r, 50));
      });

      // UI không hiển thị thông báo thành công của phiên cũ
      expect(screen.queryByText('Đã cập nhật chiến dịch thành công.')).not.toBeInTheDocument();

      // QueryClient không lưu dữ liệu '75.00' hay uncertain marker vào cache của admin-1 hoặc admin-2
      expect(
        queryClient.getQueryData(adminPromotionsKeys.detail('admin-1', sampleSimplePromotion.id)),
      ).toBeUndefined();
      expect(
        queryClient.getQueryData(
          adminPromotionsKeys.uncertainMarker('admin-1', 'edit', sampleSimplePromotion.id),
        ),
      ).toBeUndefined();
      const admin2Detail = queryClient.getQueryData<AdminPromotionDetail>(
        adminPromotionsKeys.detail('admin-2', sampleSimplePromotion.id),
      );
      expect(admin2Detail?.discountValue).not.toBe('75.00');
    });

    it('URL page=abc giữ keep=1, không cảnh báo React (setSearchParams in render)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      setupMockFetch({});

      renderWithProviders(
        <>
          <LocationDisplay />
          <Routes>
            <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
          </Routes>
        </>,
        '/admin/promotions?page=abc&keep=1',
      );

      await screen.findByRole('table');

      const locDisplay = screen.getByTestId('location-display');
      expect(locDisplay.textContent).toBe('/admin/promotions?page=1&keep=1');

      // Đảm bảo không có warning/error từ React khi render
      const reactRenderIssues = [
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
      ].filter((call) =>
        call.some(
          (arg) =>
            typeof arg === 'string' &&
            (arg.includes('Cannot update a component') ||
              arg.includes('while rendering a different component') ||
              arg.includes('Rendered fewer hooks') ||
              arg.includes('Rendered more hooks')),
        ),
      );
      expect(reactRenderIssues).toHaveLength(0);
    });

    it('chuyển giữa URL hợp lệ/không hợp lệ, Back/Forward, assert URL từng bước và không lỗi/cảnh báo điều hướng/hook', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      setupMockFetch({});
      const user = userEvent.setup();

      renderWithProviders(
        <>
          <LocationDisplay />
          <NavTester />
          <Routes>
            <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
          </Routes>
        </>,
        '/admin/promotions?page=1',
      );

      await screen.findByRole('table');
      expect(screen.getByTestId('location-display').textContent).toBe('/admin/promotions?page=1');

      // Chuyển sang URL không hợp lệ -> Navigate replace sang page=1&keep=1
      await user.click(screen.getByRole('button', { name: 'Go Invalid' }));
      await screen.findByRole('table');
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/admin/promotions?page=1&keep=1',
      );

      // Chuyển sang URL hợp lệ page 2
      await user.click(screen.getByRole('button', { name: 'Go Page 2' }));
      await screen.findByRole('table');
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/admin/promotions?page=2&keep=1',
      );

      // Back -> quay lại đúng /admin/promotions?page=1&keep=1 (vì Go Invalid đã replace)
      await user.click(screen.getByRole('button', { name: 'Go Back' }));
      await screen.findByRole('table');
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/admin/promotions?page=1&keep=1',
      );

      // Forward -> tiến tới đúng /admin/promotions?page=2&keep=1
      await user.click(screen.getByRole('button', { name: 'Go Forward' }));
      await screen.findByRole('table');
      expect(screen.getByTestId('location-display').textContent).toBe(
        '/admin/promotions?page=2&keep=1',
      );

      const navOrHookIssues = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls].filter(
        (call) =>
          call.some(
            (arg) =>
              typeof arg === 'string' &&
              /hook|render|navigate|router|searchparams|setstate/i.test(arg),
          ),
      );
      expect(navOrHookIssues).toHaveLength(0);
    });

    it('nút thao tác trên bảng AdminPromotionsPage có minHeight chuẩn 44px', async () => {
      setupMockFetch({});

      renderWithProviders(
        <Routes>
          <Route path="/admin/promotions" element={<AdminPromotionsPage />} />
        </Routes>,
      );

      const table = await screen.findByRole('table');
      const detailLink = within(table).getByRole('link', { name: 'Chi tiết' });
      const toggleBtn = within(table).getByRole('button', { name: 'Ngưng' });
      const viewLink = within(table).getByRole('link', { name: 'Xem' });

      expect(detailLink.style.minHeight).toBe('44px');
      expect(toggleBtn.style.minHeight).toBe('44px');
      expect(viewLink.style.minHeight).toBe('44px');
    });
  });
});
