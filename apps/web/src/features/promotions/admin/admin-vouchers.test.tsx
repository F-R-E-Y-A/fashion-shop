import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/app';
import { type AuthenticatedUser, AuthProvider, useAuth } from '@/features/account';

import {
  type AdminVoucher,
  type AdminVoucherListResponse,
  adminVouchersKeys,
  localDateTimeLocalToUtcIso,
  utcIsoToLocalDateTimeLocal,
} from './admin-vouchers.api.js';

const adminActor: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@freya.test',
  roles: ['ADMIN'],
};

const staffActor: AuthenticatedUser = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'staff@freya.test',
  roles: ['STAFF'],
};

const sampleVoucher1: AdminVoucher = {
  id: '00000000-0000-4000-8000-000000000011',
  code: 'SUMMER20',
  status: 'ACTIVE',
  discountType: 'PERCENTAGE',
  discountValue: '20',
  maxDiscountAmount: '100000',
  minOrderAmount: '300000',
  usageLimit: 200,
  perUserLimit: 2,
  usageCount: 15,
  startsAt: '2026-06-01T10:30:45.123Z',
  endsAt: '2026-12-31T23:59:59.987Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const sampleVoucher2: AdminVoucher = {
  id: '00000000-0000-4000-8000-000000000012',
  code: 'WELCOME50K',
  status: 'INACTIVE',
  discountType: 'FIXED_AMOUNT',
  discountValue: '50000',
  maxDiscountAmount: null,
  minOrderAmount: '200000',
  usageLimit: null,
  perUserLimit: 1,
  usageCount: 0,
  startsAt: null,
  endsAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const failure = (status: number, message = 'Synthetic error') =>
  reply(
    {
      statusCode: status,
      code: `HTTP_${status}`,
      message,
      path: '/api/admin/vouchers',
      timestamp: new Date().toISOString(),
    },
    status,
  );

interface BackendRecorded {
  path: string;
  method: string;
  token?: string;
  body?: unknown;
}

function setupBackend() {
  const state: {
    actor: AuthenticatedUser | null;
    vouchers: AdminVoucher[];
    override?: (r: BackendRecorded) => Promise<Response> | Response | undefined;
  } = {
    actor: adminActor,
    vouchers: [{ ...sampleVoucher1 }, { ...sampleVoucher2 }],
  };

  const requests: BackendRecorded[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const r: BackendRecorded = {
        path: url.pathname + url.search,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      requests.push(r);

      if (state.override) {
        const custom = await state.override(r);
        if (custom) return custom;
      }

      const session = () =>
        state.actor ? reply({ accessToken: 'mock-token', user: state.actor }) : failure(401);
      if (url.pathname === '/api/auth/refresh') return session();
      if (url.pathname === '/api/auth/me') return session();

      if (state.actor && !state.actor.roles.includes('ADMIN')) {
        return failure(403, 'Forbidden: Admin role required');
      }

      if (url.pathname === '/api/admin/vouchers' && r.method === 'GET') {
        const search = url.searchParams.get('search')?.toLowerCase() ?? '';
        const status = url.searchParams.get('status');
        const page = parseInt(url.searchParams.get('page') ?? '1', 10);
        const pageSize = parseInt(url.searchParams.get('pageSize') ?? '12', 10);

        let filtered = state.vouchers;
        if (search) {
          filtered = filtered.filter((v) => v.code.toLowerCase().includes(search));
        }
        if (status) {
          filtered = filtered.filter((v) => v.status === status);
        }

        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize) || 1;
        const start = (page - 1) * pageSize;
        const items = filtered.slice(start, start + pageSize);

        const resp: AdminVoucherListResponse = {
          items,
          total,
          page,
          pageSize,
          totalPages,
        };
        return reply(resp);
      }

      if (url.pathname === '/api/admin/vouchers' && r.method === 'POST') {
        const body = r.body as {
          code: string;
          status?: 'ACTIVE' | 'INACTIVE';
          discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
          discountValue: string;
          startsAt?: string | null;
          endsAt?: string | null;
        };

        if (state.vouchers.some((v) => v.code === body.code.trim().toUpperCase())) {
          return failure(409, 'Mã giảm giá đã tồn tại');
        }

        const newVoucher: AdminVoucher = {
          id: `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`,
          code: body.code.trim().toUpperCase(),
          status: body.status ?? 'INACTIVE',
          discountType: body.discountType,
          discountValue: body.discountValue,
          maxDiscountAmount: null,
          minOrderAmount: null,
          usageLimit: null,
          perUserLimit: 1,
          usageCount: 0,
          startsAt: body.startsAt ?? null,
          endsAt: body.endsAt ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.vouchers.unshift(newVoucher);
        return reply(newVoucher, 201);
      }

      const statusMatch = url.pathname.match(/^\/api\/admin\/vouchers\/([^/]+)\/status$/);
      if (statusMatch && r.method === 'PATCH') {
        const voucherId = statusMatch[1];
        const voucher = state.vouchers.find((v) => v.id === voucherId);
        if (!voucher) return failure(404, 'Voucher not found');

        const body = r.body as { status: 'ACTIVE' | 'INACTIVE' };
        const updated: AdminVoucher = {
          ...voucher,
          status: body.status,
          updatedAt: new Date().toISOString(),
        };
        state.vouchers = state.vouchers.map((v) => (v.id === voucherId ? updated : v));
        return reply(updated);
      }

      const detailMatch = url.pathname.match(/^\/api\/admin\/vouchers\/([^/]+)$/);
      if (detailMatch) {
        const voucherId = detailMatch[1];
        const voucher = state.vouchers.find((v) => v.id === voucherId);
        if (!voucher) return failure(404, 'Voucher not found');

        if (r.method === 'GET') {
          return reply(voucher);
        }

        if (r.method === 'PATCH') {
          const body = r.body as {
            code?: string;
            status?: 'ACTIVE' | 'INACTIVE';
            discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
            discountValue?: string;
            startsAt?: string | null;
            endsAt?: string | null;
            expectedUpdatedAt?: string;
          };

          if (body.expectedUpdatedAt && body.expectedUpdatedAt !== voucher.updatedAt) {
            return failure(409, 'Dữ liệu đã thay đổi bởi phiên khác');
          }

          if (
            body.code &&
            body.code !== voucher.code &&
            state.vouchers.some((v) => v.id !== voucherId && v.code === body.code)
          ) {
            return failure(409, 'Mã giảm giá đã tồn tại');
          }

          const updated: AdminVoucher = {
            ...voucher,
            ...body,
            updatedAt: new Date(Date.now() + 1000).toISOString(),
          };
          state.vouchers = state.vouchers.map((v) => (v.id === voucherId ? updated : v));
          return reply(updated);
        }
      }

      return failure(404, 'Not found');
    }),
  );

  return {
    state,
    requests,
  };
}

function mountVouchers(path = '/admin/vouchers') {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        retry: false,
      },
    },
  });

  const holder: { auth?: ReturnType<typeof useAuth>; go?: (path: string) => void } = {};
  function Probe() {
    holder.auth = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    holder.go = (p) => navigate(p);
    return <output data-testid="location">{location.pathname + location.search}</output>;
  }

  const result = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Probe />
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    client,
    auth: () => holder.auth!,
    go: (p: string) => holder.go!(p),
  };
}

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
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('UC-10.2 Quản trị Voucher (Admin Vouchers - Issue #86)', () => {
  describe('UC-10.2/AC1 Phân quyền & Header an toàn', () => {
    it('Hiển thị thông báo không có quyền AdminForbidden cho vai trò STAFF', async () => {
      const backend = setupBackend();
      backend.state.actor = staffActor;

      mountVouchers('/admin/vouchers');

      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
    });
  });

  describe('UC-10.2/AC2 Danh sách & Phân trang', () => {
    it('Hiển thị danh sách voucher với badge trạng thái và thống kê sử dụng', async () => {
      setupBackend();
      mountVouchers('/admin/vouchers');

      const summerElements = await screen.findAllByText('SUMMER20');
      expect(summerElements.length).toBeGreaterThan(0);
      const welcomeElements = screen.getAllByText('WELCOME50K');
      expect(welcomeElements.length).toBeGreaterThan(0);

      // Badges
      expect(screen.getAllByText('Đang hoạt động').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ngừng hoạt động').length).toBeGreaterThan(0);

      // Link chi tiết
      expect(
        screen.getByRole('link', { name: `Xem chi tiết ${sampleVoucher1.code}` }),
      ).toHaveAttribute('href', `/admin/vouchers/${sampleVoucher1.id}`);
    });

    it('Tìm kiếm mã voucher cập nhật URL search param', async () => {
      setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers');

      await screen.findAllByText('SUMMER20');
      const searchInput = screen.getByPlaceholderText(/Tìm theo mã voucher/);
      await user.type(searchInput, 'SUMMER');
      await user.click(screen.getByRole('button', { name: 'Tìm kiếm' }));

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toContain('search=SUMMER');
      });
      expect(screen.getAllByText('SUMMER20').length).toBeGreaterThan(0);
      expect(screen.queryByText('WELCOME50K')).not.toBeInTheDocument();
    });

    it('Lọc theo trạng thái và xóa bộ lọc', async () => {
      setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers');

      await screen.findAllByText('SUMMER20');
      const select = screen.getByRole('combobox', { name: 'Lọc theo trạng thái' });
      await user.selectOptions(select, 'INACTIVE');

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toContain('status=INACTIVE');
      });
      expect(screen.getAllByText('WELCOME50K').length).toBeGreaterThan(0);
      expect(screen.queryByText('SUMMER20')).not.toBeInTheDocument();
    });

    it('Regression P2 #5: Bảo toàn tham số search, status, page khi điều hướng sang trang tạo mới/chi tiết và quay lại', async () => {
      setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers?search=SUMMER&status=ACTIVE&page=1');

      await screen.findAllByText('SUMMER20');

      // Nhấn + Thêm mã giảm giá
      const createLink = screen.getByRole('link', { name: '+ Thêm mã giảm giá' });
      await user.click(createLink);

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/admin/vouchers/new');
      });

      // Nhấn Quay lại danh sách
      const backFromNew = screen.getByRole('link', { name: '← Quay lại danh sách' });
      await user.click(backFromNew);

      // URL search params phải được khôi phục đầy đủ
      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/admin/vouchers?search=SUMMER&status=ACTIVE&page=1',
        );
      });

      // Đi vào trang chi tiết
      const detailLink = screen.getByRole('link', { name: `Xem chi tiết ${sampleVoucher1.code}` });
      await user.click(detailLink);

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          `/admin/vouchers/${sampleVoucher1.id}`,
        );
      });
      await screen.findByRole('heading', { name: 'SUMMER20' });

      // Nhấn Quay lại danh sách từ trang chi tiết
      const backFromDetail = screen.getByRole('link', { name: '← Quay lại danh sách' });
      await user.click(backFromDetail);

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/admin/vouchers?search=SUMMER&status=ACTIVE&page=1',
        );
      });
    });
  });

  describe('UC-10.2/AC3 Tạo mới voucher & Ràng buộc toàn vẹn', () => {
    it('Tạo voucher mới: mặc định INACTIVE, kiểm tra lỗi client-side và trùng mã 409', async () => {
      setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers/new');

      expect(
        await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' }),
      ).toBeInTheDocument();

      // Mặc định trạng thái là INACTIVE
      const statusSelect = screen.getByLabelText(/Trạng thái ban đầu/);
      expect(statusSelect).toHaveValue('INACTIVE');

      // Thử gửi form rỗng -> kiểm tra client-side validation
      const submitBtn = screen.getByRole('button', { name: 'Tạo mã giảm giá' });
      await user.click(submitBtn);

      expect(screen.getByText('Mã giảm giá phải từ 3 đến 30 ký tự.')).toBeInTheDocument();
      expect(screen.getByText('Giá trị giảm phải là số lớn hơn 0.')).toBeInTheDocument();

      // Nhập mã đã tồn tại (SUMMER20)
      const codeInput = screen.getByLabelText(/Mã voucher/);
      const valueInput = screen.getByLabelText(/Giá trị giảm/);
      await user.type(codeInput, 'SUMMER20');
      await user.type(valueInput, '10');

      await user.click(submitBtn);

      expect(
        await screen.findByText(
          'Mã giảm giá "SUMMER20" đã tồn tại trên hệ thống. Vui lòng chọn mã khác.',
        ),
      ).toBeInTheDocument();
    });

    it('Tạo voucher mới thành công chuyển hướng đến chi tiết', async () => {
      setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers/new');

      await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' });

      const codeInput = screen.getByLabelText(/Mã voucher/);
      const valueInput = screen.getByLabelText(/Giá trị giảm/);
      await user.type(codeInput, 'FLASH15');
      await user.type(valueInput, '15');

      const submitBtn = screen.getByRole('button', { name: 'Tạo mã giảm giá' });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toMatch(/\/admin\/vouchers\/00000000/);
      });
    });

    it('Regression P2 #3: Form tạo mới gặp lỗi mạng/500 lưu marker uncertain, khóa submit và đối chiếu qua GET recheck', async () => {
      const backend = setupBackend();
      let failPost = true;
      backend.state.override = (r) => {
        if (r.path === '/api/admin/vouchers' && r.method === 'POST' && failPost) {
          failPost = false;
          // Mô phỏng server đã lưu voucher nhưng mất kết nối trả về client
          backend.state.vouchers.unshift({
            id: '00000000-0000-4000-8000-000000000099',
            code: 'UNCERTAINCREATE',
            status: 'INACTIVE',
            discountType: 'PERCENTAGE',
            discountValue: '10',
            maxDiscountAmount: null,
            minOrderAmount: null,
            usageLimit: null,
            perUserLimit: null,
            usageCount: 0,
            startsAt: null,
            endsAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          return failure(500, 'Server timeout on commit');
        }
        return undefined;
      };

      const user = userEvent.setup();
      mountVouchers('/admin/vouchers/new');

      await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' });
      const codeInput = screen.getByLabelText(/Mã voucher/);
      const valueInput = screen.getByLabelText(/Giá trị giảm/);
      await user.type(codeInput, 'UNCERTAINCREATE');
      await user.type(valueInput, '10');

      const submitBtn = screen.getByRole('button', { name: 'Tạo mã giảm giá' });
      await user.click(submitBtn);

      // Xuất hiện thông báo chưa rõ kết quả và nút Kiểm tra lại
      expect(
        await screen.findByText(/Chưa rõ kết quả tạo mã do gián đoạn kết nối/),
      ).toBeInTheDocument();
      const recheckBtn = screen.getByRole('button', { name: 'Kiểm tra lại' });
      expect(recheckBtn).toBeInTheDocument();

      // Nút tạo mã giảm giá bị khóa
      expect(submitBtn).toBeDisabled();

      // Nhấn Kiểm tra lại để đối chiếu
      await user.click(recheckBtn);

      // Đối chiếu thấy mã đã tồn tại -> chuyển hướng sang trang chi tiết
      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(
          '/admin/vouchers/00000000-0000-4000-8000-000000000099',
        );
      });
    });
  });

  describe('UC-10.2/AC4 Chi tiết, Cập nhật & Kiểm soát tương tranh CAS', () => {
    it('Chi tiết voucher: hiển thị form, hỗ trợ sửa và gửi expectedUpdatedAt CAS', async () => {
      const backend = setupBackend();
      const user = userEvent.setup();
      mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);

      expect(await screen.findByRole('heading', { name: 'SUMMER20' })).toBeInTheDocument();
      const discountInput = screen.getByLabelText(/Giá trị giảm/);
      expect(discountInput).toHaveValue('20');

      // Sửa giá trị
      await user.clear(discountInput);
      await user.type(discountInput, '25');

      // Submit
      const saveBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText('Đã cập nhật mã giảm giá thành công.')).toBeInTheDocument();
      });

      const patchReq = backend.requests.find(
        (r) => r.path === `/api/admin/vouchers/${sampleVoucher1.id}` && r.method === 'PATCH',
      );
      expect(patchReq).toBeDefined();
      expect((patchReq?.body as { expectedUpdatedAt?: string })?.expectedUpdatedAt).toBe(
        sampleVoucher1.updatedAt,
      );
    });

    it('Chi tiết voucher: xử lý xung đột đồng thời CAS 409 giữ draft và cho phép nạp lại dữ liệu máy chủ', async () => {
      const backend = setupBackend();
      backend.state.override = (r) => {
        if (r.path === `/api/admin/vouchers/${sampleVoucher1.id}` && r.method === 'PATCH') {
          return failure(409, 'Dữ liệu đã được chỉnh sửa bởi phiên khác');
        }
        return undefined;
      };

      const user = userEvent.setup();
      mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);

      await screen.findByRole('heading', { name: 'SUMMER20' });
      const discountInput = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(discountInput);
      await user.type(discountInput, '30');

      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      expect(
        await screen.findByText(/Mã giảm giá đã được cập nhật bởi quản trị viên khác/),
      ).toBeInTheDocument();
      const reloadBtn = screen.getByRole('button', { name: 'Tải lại dữ liệu máy chủ' });
      expect(reloadBtn).toBeInTheDocument();

      // Bản thảo vẫn còn nguyên trên ô input
      expect(discountInput).toHaveValue('30');

      // Nhấn tải lại bản mới từ máy chủ
      await user.click(reloadBtn);
      expect(discountInput).toHaveValue('20');
    });

    it('Regression P1 #1: Không sửa ngày thì giữ nguyên ISO gốc có ms; sửa trường khác không làm lệch giờ UTC+7', async () => {
      const backend = setupBackend();
      const user = userEvent.setup();
      mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);

      await screen.findByRole('heading', { name: 'SUMMER20' });

      // Chỉ sửa discountValue, không đụng vào input startsAt/endsAt
      const discountInput = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(discountInput);
      await user.type(discountInput, '35');

      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

      await waitFor(() => {
        expect(screen.getByText('Đã cập nhật mã giảm giá thành công.')).toBeInTheDocument();
      });

      const patchReq = backend.requests.find(
        (r) => r.path === `/api/admin/vouchers/${sampleVoucher1.id}` && r.method === 'PATCH',
      );
      expect(patchReq).toBeDefined();
      const body = patchReq?.body as { startsAt?: string; endsAt?: string };
      // Phải bảo toàn chính xác chuỗi gốc 2026-06-01T10:30:45.123Z kèm mili-giây
      expect(body.startsAt).toBe('2026-06-01T10:30:45.123Z');
      expect(body.endsAt).toBe('2026-12-31T23:59:59.987Z');
    });

    it('Regression P1 #1: Chuyển đổi chính xác giữa giờ địa phương và UTC ISO khi chỉnh sửa thời gian', () => {
      // Test độc lập helpers chuyển đổi múi giờ
      const iso = '2026-11-11T10:30:00.000Z';
      const local = utcIsoToLocalDateTimeLocal(iso);
      expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      // Chuyển ngược lại
      const roundtripIso = localDateTimeLocalToUtcIso(local);
      const diffMs = Math.abs(new Date(roundtripIso).getTime() - new Date(iso).getTime());
      // Sai lệch không quá 60 giây (do datetime-local có độ phân giải phút)
      expect(diffMs).toBeLessThanOrEqual(60_000);
    });

    it('Regression P2 #2: Refetch dữ liệu khi focus không ghi đè bản thảo đang gõ (dirty fields)', async () => {
      setupBackend();
      const user = userEvent.setup();
      const { client } = mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);

      await screen.findByRole('heading', { name: 'SUMMER20' });
      const discountInput = screen.getByLabelText(/Giá trị giảm/);

      // Người dùng đang gõ dở
      await user.clear(discountInput);
      await user.type(discountInput, '99');

      // Mô phỏng background refetch trên cửa sổ
      client.setQueryData(adminVouchersKeys.detail(adminActor.id, sampleVoucher1.id), {
        ...sampleVoucher1,
        code: 'SUMMER20-NEW',
        discountValue: '18', // server đã đổi thành 18
      });

      // Trường không sửa (clean) được cập nhật từ máy chủ
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'SUMMER20-NEW' })).toBeInTheDocument();
      });
      // Trường đã bị sửa (dirty) phải giữ nguyên giá trị người dùng gõ
      expect(discountInput).toHaveValue('99');
    });

    it('Regression P2 #3: Form cập nhật gặp lỗi 500/mạng lưu marker uncertain, khóa submit và đối chiếu qua GET recheck', async () => {
      const backend = setupBackend();
      let failPatch = true;
      backend.state.override = (r) => {
        if (
          r.path === `/api/admin/vouchers/${sampleVoucher1.id}` &&
          r.method === 'PATCH' &&
          failPatch
        ) {
          failPatch = false;
          // Server đã cập nhật nhưng ngắt kết nối
          const v = backend.state.vouchers.find((x) => x.id === sampleVoucher1.id)!;
          v.discountValue = '55';
          v.updatedAt = new Date(Date.now() + 2000).toISOString();
          return failure(500, 'Network timeout after write');
        }
        return undefined;
      };

      const user = userEvent.setup();
      mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);

      await screen.findByRole('heading', { name: 'SUMMER20' });
      const discountInput = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(discountInput);
      await user.type(discountInput, '55');

      const submitBtn = screen.getByRole('button', { name: 'Lưu thay đổi' });
      await user.click(submitBtn);

      // Banner uncertain xuất hiện
      expect(
        await screen.findByText(/Chưa rõ kết quả cập nhật do gián đoạn kết nối/),
      ).toBeInTheDocument();
      const recheckBtn = screen.getByRole('button', { name: 'Kiểm tra lại' });
      expect(recheckBtn).toBeInTheDocument();

      // Nút submit bị khóa
      expect(submitBtn).toBeDisabled();

      // Nhấn Kiểm tra lại
      await user.click(recheckBtn);

      // Đối chiếu thành công
      expect(
        await screen.findByText('Đã xác nhận: thay đổi đã được áp dụng trên máy chủ.'),
      ).toBeInTheDocument();
    });
  });

  describe('UC-10.2/AC5 Chuyển đổi trạng thái & Khắc phục gián đoạn', () => {
    it('Bật hộp thoại xác nhận khi kích hoạt/ngừng hoạt động voucher từ danh sách', async () => {
      const backend = setupBackend();
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers');

      await screen.findAllByText('SUMMER20');
      // Voucher 1 đang ACTIVE -> nút "Ngừng" trong bảng
      const deactivateBtn = screen.getAllByRole('button', { name: 'Ngừng' })[0];
      await user.click(deactivateBtn);

      const dialog = screen.getByRole('dialog', { name: 'Xác nhận ngừng hoạt động mã' });
      expect(dialog).toBeInTheDocument();
      expect(within(dialog).getByText(/Mã giảm giá: SUMMER20/)).toBeInTheDocument();

      // Xác nhận trong dialog
      const confirmBtn = within(dialog).getByRole('button', { name: 'Ngừng hoạt động' });
      await user.click(confirmBtn);

      // Chờ cập nhật thành công và nút chuyển thành Bật
      await waitFor(() => {
        expect(screen.getAllByRole('button', { name: 'Bật' })[0]).toBeInTheDocument();
      });
      expect(
        backend.requests.some(
          (r) => r.path.includes('/api/admin/vouchers/') && r.method === 'PATCH',
        ),
      ).toBe(true);
    });

    it('Xử lý lỗi mạng/500 khi đổi trạng thái: hiển thị nút Kiểm tra lại và chặn spam mutation', async () => {
      const backend = setupBackend();
      let failOnce = true;
      backend.state.override = (r) => {
        if (r.path.includes('/api/admin/vouchers/') && r.method === 'PATCH' && failOnce) {
          failOnce = false;
          return failure(500, 'Server error during status change');
        }
        return undefined;
      };

      const user = userEvent.setup();
      mountVouchers('/admin/vouchers');

      await screen.findAllByText('SUMMER20');
      const deactivateBtn = screen.getAllByRole('button', { name: 'Ngừng' })[0];
      await user.click(deactivateBtn);

      const dialog = screen.getByRole('dialog', { name: 'Xác nhận ngừng hoạt động mã' });
      const confirmBtn = within(dialog).getByRole('button', { name: 'Ngừng hoạt động' });
      await user.click(confirmBtn);

      // Thông báo lỗi chưa rõ kết quả và có nút kiểm tra lại
      expect(
        await screen.findByText(/Chưa rõ kết quả thao tác do gián đoạn kết nối/),
      ).toBeInTheDocument();
      const recheckBtn = screen.getByRole('button', { name: /Kiểm tra lại/ });
      expect(recheckBtn).toBeInTheDocument();

      // Nút toggle bị khóa cho đến khi đối chiếu
      expect(screen.getAllByRole('button', { name: 'Ngừng' })[0]).toBeDisabled();

      // Nhấn Kiểm tra lại để đối chiếu
      await user.click(recheckBtn);
      await waitFor(() => {
        expect(
          screen.queryByText(/Chưa rõ kết quả thao tác do gián đoạn kết nối/),
        ).not.toBeInTheDocument();
      });
    });

    it('Regression P2 #4: Mất quyền (403) trong quá trình thao tác chặn thông báo thành công và xóa marker', async () => {
      const backend = setupBackend();
      backend.state.override = (r) => {
        if (r.path.includes('/api/admin/vouchers/') && r.method === 'PATCH') {
          return failure(403, 'Forbidden: Admin role revoked');
        }
        return undefined;
      };

      const user = userEvent.setup();
      mountVouchers('/admin/vouchers');

      await screen.findAllByText('SUMMER20');
      const deactivateBtn = screen.getAllByRole('button', { name: 'Ngừng' })[0];
      await user.click(deactivateBtn);

      const dialog = screen.getByRole('dialog', { name: 'Xác nhận ngừng hoạt động mã' });
      const confirmBtn = within(dialog).getByRole('button', { name: 'Ngừng hoạt động' });
      await user.click(confirmBtn);

      // Phải hiện màn hình mất quyền AdminForbidden, tuyệt đối không hiện thông báo thành công
      expect(
        await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/thành công/i)).not.toBeInTheDocument();
    });
  });

  describe('CODEX_REVIEW Issue86 remaining regressions', () => {
    it('CODEX_REVIEW edit recheck must not claim success when server still has old values', async () => {
      const b = setupBackend();
      b.state.override = (r) =>
        r.method === 'PATCH' ? failure(500, 'Synthetic uncertain result') : undefined;
      const user = userEvent.setup();
      mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);
      await screen.findByRole('heading', { name: 'SUMMER20' });
      const input = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '55');
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await screen.findByText(/Chưa rõ kết quả cập nhật/);
      await user.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
      expect(
        screen.queryByText('Đã xác nhận: thay đổi đã được áp dụng trên máy chủ.'),
      ).not.toBeInTheDocument();
    });

    it('CODEX_REVIEW changing code must not bypass uncertain create lock', async () => {
      const b = setupBackend();
      b.state.override = (r) =>
        r.method === 'POST' && r.path === '/api/admin/vouchers'
          ? failure(500, 'Synthetic uncertain result')
          : undefined;
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers/new');
      await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' });
      const input = screen.getByLabelText(/Mã voucher/);
      await user.type(input, 'PENDINGFIRST');
      await user.type(screen.getByLabelText(/Giá trị giảm/), '10');
      await user.click(screen.getByRole('button', { name: 'Tạo mã giảm giá' }));
      await screen.findByText(/Chưa rõ kết quả tạo mã/);
      await user.clear(input);
      await user.type(input, 'SECONDNEWCODE');
      expect(screen.getByRole('button', { name: 'Tạo mã giảm giá' })).toBeDisabled();
    });

    it('CODEX_REVIEW dirty field changed on server must not silently use fresh CAS token', async () => {
      const b = setupBackend();
      const user = userEvent.setup();
      const { client } = mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);
      await screen.findByRole('heading', { name: 'SUMMER20' });
      const input = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '99');
      const fresh = {
        ...sampleVoucher1,
        discountValue: '30',
        updatedAt: '2026-11-11T00:00:00.001Z',
      };
      b.state.vouchers = b.state.vouchers.map((v) => (v.id === fresh.id ? fresh : v));
      await act(async () => {
        client.setQueryData(adminVouchersKeys.detail(adminActor.id, fresh.id), fresh);
      });
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(b.requests.some((r) => r.method === 'PATCH')).toBe(true));
      expect(b.state.vouchers.find((v) => v.id === fresh.id)?.discountValue).toBe('30');
    });

    it('CODEX_REVIEW refetch modifying unrelated clean field merges cleanly without false conflict', async () => {
      const b = setupBackend();
      const user = userEvent.setup();
      const { client } = mountVouchers(`/admin/vouchers/${sampleVoucher1.id}`);
      await screen.findByRole('heading', { name: 'SUMMER20' });

      // Admin chỉ sửa discountValue thành 99
      const input = screen.getByLabelText(/Giá trị giảm/);
      await user.clear(input);
      await user.type(input, '99');

      // Server chỉ đổi usageLimit từ 200 thành 180 và cập nhật timestamp
      const fresh: AdminVoucher = {
        ...sampleVoucher1,
        usageLimit: 180,
        updatedAt: '2026-11-11T00:00:00.001Z',
      };
      b.state.vouchers = b.state.vouchers.map((v) => (v.id === fresh.id ? fresh : v));
      await act(async () => {
        client.setQueryData(adminVouchersKeys.detail(adminActor.id, fresh.id), fresh);
      });

      // Nhấn Lưu thay đổi: tự động nâng CAS token vì không xung đột dirty field
      await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
      await waitFor(() => expect(b.requests.some((r) => r.method === 'PATCH')).toBe(true));
      expect(b.state.vouchers.find((v) => v.id === fresh.id)?.discountValue).toBe('99');
      expect(b.state.vouchers.find((v) => v.id === fresh.id)?.usageLimit).toBe(180);
      expect(await screen.findByText('Đã cập nhật mã giảm giá thành công.')).toBeInTheDocument();
    });

    it('CODEX_REVIEW leave and return to create page retains uncertain marker lock', async () => {
      const b = setupBackend();
      b.state.override = (r) =>
        r.method === 'POST' && r.path === '/api/admin/vouchers'
          ? failure(500, 'Synthetic uncertain result')
          : undefined;
      const user = userEvent.setup();
      mountVouchers('/admin/vouchers/new');
      await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' });

      const input = screen.getByLabelText(/Mã voucher/);
      await user.type(input, 'LEAVEANDRETURN');
      await user.type(screen.getByLabelText(/Giá trị giảm/), '15');
      await user.click(screen.getByRole('button', { name: 'Tạo mã giảm giá' }));
      await screen.findByText(/Chưa rõ kết quả tạo mã/);

      // Quay lại danh sách rồi vào lại /admin/vouchers/new
      await user.click(screen.getByRole('link', { name: /Quay lại danh sách/ }));
      await screen.findByRole('heading', { name: 'Mã giảm giá' });

      await user.click(screen.getByRole('link', { name: /Thêm mã giảm giá/ }));
      await screen.findByRole('heading', { name: 'Tạo mã giảm giá mới' });

      expect(screen.getByRole('button', { name: 'Tạo mã giảm giá' })).toBeDisabled();
      expect(screen.getByText(/Chưa rõ kết quả tạo mã/)).toBeInTheDocument();
    });
  });
});
