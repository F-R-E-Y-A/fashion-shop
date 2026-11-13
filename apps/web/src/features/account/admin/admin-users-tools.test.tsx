import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  type RecordedRequest,
  renderAdminApp,
} from './test-support/admin-harness.js';
import { ADMIN_ACTION_TIMEOUT_MS } from './user-status-action.js';
import { USER_SEARCH_DEBOUNCE_MS } from './UserListControls.js';

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
  AdminProductsPage: () => <p>Tổng quan sản phẩm của Bảo</p>,
}));
vi.mock('@/features/cart', () => ({
  cartKeys: { all: ['cart'], current: () => ['cart', 'current'] },
  getCart: async () => ({ items: [], itemCount: 0 }),
  mergeCart: async () => null,
  CartPage: () => <p>Trang giỏ hàng</p>,
}));

const location = () => screen.getByTestId('location');
const back = () => fireEvent.click(screen.getByTestId('history-back'));
const isList = (request: RecordedRequest) => request.path.startsWith('/api/admin/users?');
const isAdminPost = (request: RecordedRequest) =>
  request.method === 'POST' && request.path.startsWith('/api/admin/');
const listParams = (request: RecordedRequest | undefined) =>
  Object.fromEntries(new URL(`http://x${request?.path ?? ''}`).searchParams);
const rowOf = async (email: string) =>
  (await screen.findByRole('link', { name: email })).closest('tr') as HTMLElement;
const searchBox = () => screen.getByRole('searchbox', { name: 'Tìm theo email' });

/** 12 tai khoan: 1 admin + 6 ACTIVE + 4 LOCKED + 1 chua xac thuc; moi nhat truoc. */
function people() {
  return [
    asAdminUser(adminA),
    ...Array.from({ length: 6 }, (_, i) => makeUser(i + 1)),
    ...Array.from({ length: 4 }, (_, i) =>
      makeUser(i + 7, { status: 'LOCKED', email: `bi-khoa-${i + 7}@example.test` }),
    ),
    makeUser(11, { emailVerifiedAt: null, email: 'chua-xac-thuc@example.test' }),
  ];
}

beforeAll(installDialogStub);
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('UC-02.1 Issue #48 — tìm, lọc, sắp xếp trên URL', () => {
  it('UC-02.1/AC12 gõ tìm chờ 300ms rồi gửi MỘT request, thay URL bằng replace và về trang 1', async () => {
    const backend = createAdminBackend({ users: people() });
    const actor = userEvent.setup();
    renderAdminApp('/admin/users?page=2&pageSize=10');
    await screen.findByText('chua-xac-thuc@example.test');
    const before = backend.requests.filter(isList).length;

    await actor.type(searchBox(), 'bi-khoa');
    expect(backend.requests.filter(isList)).toHaveLength(before);

    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?q=bi-khoa&pageSize=10'));
    expect(location()).toHaveAttribute('data-navigation', 'REPLACE');
    await waitFor(() => expect(backend.requests.filter(isList).slice(before)).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, USER_SEARCH_DEBOUNCE_MS));
    const sent = backend.requests.filter(isList).slice(before);
    expect(sent).toHaveLength(1);
    expect(listParams(sent[0])).toEqual({ page: '1', pageSize: '10', q: 'bi-khoa' });
    expect(await screen.findByText('4 tài khoản phù hợp')).toBeInTheDocument();
  });

  it('UC-02.1/AC12 Enter tìm ngay, không chờ hết thời gian chờ', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');

    fireEvent.change(searchBox(), { target: { value: '  CHUA-xac  ' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Tìm người dùng' }));

    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?q=CHUA-xac'), {
      timeout: USER_SEARCH_DEBOUNCE_MS - 100,
    });
    expect(await screen.findByText('chua-xac-thuc@example.test')).toBeInTheDocument();
    expect(listParams(backend.requests.filter(isList).at(-1))).toMatchObject({ q: 'CHUA-xac' });
  });

  it('UC-02.1/AC12 bộ lọc tạo lịch sử, về trang 1, mang theo chữ đang gõ; Back trả lại điều kiện cũ', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?page=2&pageSize=10');
    await screen.findByText('chua-xac-thuc@example.test');

    fireEvent.change(searchBox(), { target: { value: 'khoa' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), {
      target: { value: 'LOCKED' },
    });
    await waitFor(() =>
      expect(location()).toHaveTextContent('/admin/users?q=khoa&status=LOCKED&pageSize=10'),
    );
    expect(location()).toHaveAttribute('data-navigation', 'PUSH');
    expect(await screen.findByText('bi-khoa-7@example.test')).toBeInTheDocument();
    expect(listParams(backend.requests.filter(isList).at(-1))).toEqual({
      page: '1',
      pageSize: '10',
      q: 'khoa',
      status: 'LOCKED',
    });

    back();
    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?page=2&pageSize=10'));
    expect(await screen.findByText('chua-xac-thuc@example.test')).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Trạng thái' })).toHaveValue('');
  });

  it('UC-02.1/AC12 debounce giữ focus ô tìm để tiếp tục gõ sau khi URL đổi', async () => {
    createAdminBackend({ users: people() });
    renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');
    searchBox().focus();
    fireEvent.change(searchBox(), { target: { value: 'bi-khoa' } });
    await screen.findByText('4 tài khoản phù hợp');
    expect(searchBox()).toHaveFocus();
    fireEvent.change(searchBox(), { target: { value: 'bi-khoa-7' } });
    await screen.findByText('1 tài khoản phù hợp');
    expect(searchBox()).toHaveFocus();
    expect(searchBox()).toHaveValue('bi-khoa-7');
  });

  it.each(['pageSize', 'page'] as const)(
    'UC-02.1/AC12 đổi %s giữ chữ tìm đang chờ, không mất q hoặc gửi debounce cũ',
    async (control) => {
      const backend = createAdminBackend({ users: people() });
      renderAdminApp('/admin/users?pageSize=10');
      await screen.findByText('nguoi-dung-1@example.test');
      fireEvent.change(searchBox(), { target: { value: 'example.test' } });
      if (control === 'pageSize') {
        fireEvent.change(screen.getByRole('combobox', { name: 'Số dòng' }), {
          target: { value: '50' },
        });
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
      }
      const expected =
        control === 'pageSize'
          ? '/admin/users?q=example.test&pageSize=50'
          : '/admin/users?q=example.test&pageSize=10';
      await waitFor(() => expect(location().textContent).toBe(expected));
      expect(searchBox()).toHaveValue('example.test');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, USER_SEARCH_DEBOUNCE_MS + 100));
      });
      expect(location().textContent).toBe(expected);
      expect(listParams(backend.requests.filter(isList).at(-1))).toMatchObject({
        q: 'example.test',
        page: '1',
      });
    },
  );

  it('UC-02.1/AC12 Back hủy tìm kiếm đang debounce, không ghi đè URL vừa khôi phục', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), {
      target: { value: 'LOCKED' },
    });
    await screen.findByText('bi-khoa-7@example.test');
    fireEvent.change(searchBox(), { target: { value: 'chu-chua-gui' } });
    back();
    await screen.findByText('nguoi-dung-1@example.test');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, USER_SEARCH_DEBOUNCE_MS + 100));
    });
    expect(location().textContent).toBe('/admin/users');
    expect(searchBox()).toHaveValue('');
    expect(
      backend.requests.filter(isList).some((request) => request.path.includes('chu-chua-gui')),
    ).toBe(false);
  });

  it('UC-02.1/AC12 tải lại trang giữ mọi điều kiện; điều khiển hiện đúng giá trị; sắp xếp gửi lên API', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?q=example&role=CUSTOMER&verified=true&sort=email_asc&pageSize=50');
    await screen.findByText('bi-khoa-10@example.test');

    expect(listParams(backend.requests.filter(isList)[0])).toEqual({
      page: '1',
      pageSize: '50',
      q: 'example',
      role: 'CUSTOMER',
      verified: 'true',
      sort: 'email_asc',
    });
    expect(searchBox()).toHaveValue('example');
    expect(screen.getByRole('combobox', { name: 'Vai' })).toHaveValue('CUSTOMER');
    expect(screen.getByRole('combobox', { name: 'Xác thực email' })).toHaveValue('true');
    expect(screen.getByRole('combobox', { name: 'Sắp xếp' })).toHaveValue('email_asc');
    expect(screen.getByRole('combobox', { name: 'Số dòng' })).toHaveValue('50');
    const emails = screen
      .getAllByRole('link', { name: /@example\.test$/u })
      .map((a) => a.textContent);
    expect(emails).toEqual([...emails].sort());
  });

  it('UC-02.1/AC12 URL sai được chuẩn hóa bằng replace, không gửi tham số sai lên API', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?status=hack&sort=name&pageSize=30&verified=1&role=LOCKED&x=1');
    await screen.findByText('nguoi-dung-1@example.test');
    expect(location()).toHaveTextContent(/^\/admin\/users$/u);
    expect(location()).toHaveAttribute('data-navigation', 'REPLACE');
    expect(backend.requests.filter(isList).map((r) => r.path)).toEqual([
      '/api/admin/users?page=1&pageSize=20',
    ]);
  });

  it('UC-02.1/AC12 đổi số dòng về trang 1 và gửi pageSize; quay lại từ chi tiết giữ đủ điều kiện', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?q=example&page=2&pageSize=10');
    await screen.findByText('chua-xac-thuc@example.test');

    fireEvent.change(await screen.findByRole('combobox', { name: 'Số dòng' }), {
      target: { value: '50' },
    });
    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?q=example&pageSize=50'));
    expect(listParams(backend.requests.filter(isList).at(-1))).toMatchObject({
      page: '1',
      pageSize: '50',
    });

    fireEvent.click(await screen.findByRole('link', { name: 'nguoi-dung-3@example.test' }));
    fireEvent.click(await screen.findByRole('link', { name: '← Danh sách người dùng' }));
    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?q=example&pageSize=50'));
  });

  it('UC-02.1/AC13 không có kết quả khác với chưa có tài khoản; Xóa bộ lọc giữ sắp xếp và số dòng', async () => {
    createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?q=khong-ai-ca&status=DISABLED&sort=oldest&pageSize=10');

    expect(await screen.findByText('Không có tài khoản phù hợp với bộ lọc.')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có tài khoản nào.')).not.toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', { name: 'Xóa bộ lọc' });
    fireEvent.click(clearButtons.at(-1) as HTMLElement);

    await waitFor(() =>
      expect(location()).toHaveTextContent('/admin/users?sort=oldest&pageSize=10'),
    );
    expect(await screen.findByText('12 tài khoản')).toBeInTheDocument();
    expect(searchBox()).toHaveValue('');
  });
});

describe('UC-02.1 Issue #48 — request về muộn và dữ liệu giữ chỗ', () => {
  it('UC-02.1/AC14 kết quả của q cũ về sau q mới không hiện; request cũ bị hủy', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users');
    await screen.findByText('nguoi-dung-1@example.test');

    const gate = deferred();
    let heldA: RecordedRequest | undefined;
    backend.override((request) => {
      if (isList(request) && listParams(request).q === 'bi-khoa' && !heldA) {
        heldA = request;
        const stale = json({
          items: [makeUser(99, { email: 'ket-qua-cu@example.test' })],
          total: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        });
        return gate.promise.then(() => stale);
      }
      return undefined;
    });

    fireEvent.change(searchBox(), { target: { value: 'bi-khoa' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Tìm người dùng' }));
    await waitFor(() => expect(heldA).toBeDefined());
    fireEvent.change(searchBox(), { target: { value: 'chua-xac' } });
    fireEvent.submit(screen.getByRole('search', { name: 'Tìm người dùng' }));
    expect(await screen.findByText('chua-xac-thuc@example.test')).toBeInTheDocument();

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(heldA?.signal?.aborted).toBe(true);
    expect(screen.queryByText('ket-qua-cu@example.test')).not.toBeInTheDocument();
    expect(screen.getByText('chua-xac-thuc@example.test')).toBeInTheDocument();
  });

  it('UC-02.1/AC14 đổi bộ lọc không hiện tập cũ trong lúc chờ; đổi trang cùng điều kiện thì giữ chỗ trang cũ', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?pageSize=10');
    await screen.findByText('nguoi-dung-1@example.test');

    const filterGate = backend.hold(
      (request) => isList(request) && listParams(request).status === 'LOCKED',
    );
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), {
      target: { value: 'LOCKED' },
    });
    expect(await screen.findByText('Đang tải danh sách người dùng…')).toBeInTheDocument();
    expect(screen.queryByText('nguoi-dung-1@example.test')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    filterGate.resolve();
    await screen.findByText('bi-khoa-7@example.test');

    back();
    await screen.findByText('nguoi-dung-1@example.test');
    const pageGate = backend.hold((request) => isList(request) && listParams(request).page === '2');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(location()).toHaveTextContent('page=2'));
    // Cung dieu kien, chi khac trang: trang 1 giu cho, bang bao dang ban.
    expect(screen.getByText('nguoi-dung-1@example.test')).toBeInTheDocument();
    expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    pageGate.resolve();
    expect(await screen.findByText('chua-xac-thuc@example.test')).toBeInTheDocument();
  });
});

describe('UC-02.1 Issue #48 — thao tác nhanh trên danh sách', () => {
  async function confirmIn(name: string) {
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name }));
  }

  it('UC-02.1/AC15 LOCKED → mở khóa: dòng rời bộ lọc, total và trang lấy lại từ API, focus vào thông báo', async () => {
    const backend = createAdminBackend({ users: people() });
    const { queryClient } = renderAdminApp('/admin/users');
    await screen.findByText('bi-khoa-7@example.test');
    // Danh sach khong loc da nam trong cache tu lan tai dau; sau thao tac no cung phai doi.
    fireEvent.change(screen.getByRole('combobox', { name: 'Trạng thái' }), {
      target: { value: 'LOCKED' },
    });
    const row = await rowOf('bi-khoa-7@example.test');
    expect(screen.getByText('4 tài khoản phù hợp')).toBeInTheDocument();

    const refetch = backend.hold(
      (request) => isList(request) && listParams(request).status === 'LOCKED',
    );
    const opener = within(row).getByRole('button', {
      name: 'Mở khóa tài khoản bi-khoa-7@example.test',
    });
    fireEvent.click(opener);
    await confirmIn('Mở khóa');

    const notice = await screen.findByText(/Đã mở khóa tài khoản/u);
    expect(notice.closest('[role="status"]')).toBeInTheDocument();
    expect(notice.closest('[tabindex="-1"]')).not.toHaveFocus();
    expect(screen.getByRole('main')).toHaveFocus();
    // Truoc khi API tra ve: dong van con nhung bao ro khong con khop, khong tu tru total.
    expect(within(row).getByText('Không còn khớp bộ lọc')).toBeInTheDocument();
    expect(within(row).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText('4 tài khoản phù hợp')).toBeInTheDocument();
    // Danh sach khong loc da cache doi trang thai dong do ngay.
    const unfiltered = queryClient.getQueryData<{
      items: { id: string; email: string; status: string }[];
    }>(adminUserKeys.list(adminA.id, DEFAULT_USER_LIST_QUERY));
    expect(unfiltered?.items.find((item) => item.email === 'bi-khoa-7@example.test')?.status).toBe(
      'ACTIVE',
    );

    refetch.resolve();
    await waitFor(() =>
      expect(screen.queryByText('bi-khoa-7@example.test')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('3 tài khoản phù hợp')).toBeInTheDocument();
    expect(backend.posts().map((r) => r.path)).toEqual([expect.stringMatching(/\/unlock$/u)]);
  });

  it('UC-02.1/AC15 ACTIVE → khóa từ danh sách đã lọc ACTIVE; Hủy trả focus về đúng nút của dòng', async () => {
    const backend = createAdminBackend({ users: people() });
    renderAdminApp('/admin/users?status=ACTIVE');
    const row = await rowOf('nguoi-dung-2@example.test');
    const opener = within(row).getByRole('button', {
      name: 'Khóa tài khoản nguoi-dung-2@example.test',
    });

    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Khóa tài khoản này?' });
    expect(dialog).toHaveTextContent('nguoi-dung-2@example.test');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(backend.posts()).toHaveLength(0);

    fireEvent.click(opener);
    await confirmIn('Khóa tài khoản');
    expect(await screen.findByText(/Đã khóa tài khoản/u)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('nguoi-dung-2@example.test')).not.toBeInTheDocument(),
    );
    // 8 ACTIVE ban dau (admin, 6 khach, 1 chua xac thuc); khoa mot thi con 7, so tu API.
    expect(screen.getByText('7 tài khoản phù hợp')).toBeInTheDocument();
  });

  it('UC-02.1/AC15 dòng cuối của trang cuối rời bộ lọc: hiện rỗng và đường về trang hợp lệ, không tự lặp', async () => {
    const locked = Array.from({ length: 11 }, (_, i) =>
      makeUser(i + 1, {
        status: 'LOCKED',
        email: `khoa-${String(i + 1).padStart(2, '0')}@example.test`,
      }),
    );
    const backend = createAdminBackend({ users: [asAdminUser(adminA), ...locked] });
    renderAdminApp('/admin/users?status=LOCKED&page=2&pageSize=10');
    const row = await rowOf('khoa-11@example.test');
    fireEvent.click(within(row).getByRole('button', { name: /^Mở khóa tài khoản/u }));
    await confirmIn('Mở khóa');

    expect(await screen.findByText('Trang 2 không có dữ liệu.')).toBeInTheDocument();
    const lists = backend.requests.filter(isList).length;
    const link = screen.getByRole('link', { name: 'Về trang 1' });
    expect(link).toHaveAttribute('href', '/admin/users?status=LOCKED&pageSize=10');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(backend.requests.filter(isList)).toHaveLength(lists);
    fireEvent.click(link);
    expect(await screen.findByText('10 tài khoản phù hợp')).toBeInTheDocument();
  });

  it('UC-02.1/AC15 bấm kép chỉ một POST; khi đang chạy mọi nút thao tác khác bị chặn', async () => {
    const backend = createAdminBackend({ users: people() });
    const gate = backend.hold(isAdminPost);
    renderAdminApp('/admin/users');
    const row = await rowOf('nguoi-dung-1@example.test');
    fireEvent.click(within(row).getByRole('button', { name: /^Khóa tài khoản/u }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Khóa tài khoản' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(backend.posts()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(backend.posts()).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(row).getByRole('button', { name: /^Khóa tài khoản/u })).toHaveTextContent(
      'Đang khóa…',
    );
    const other = within(await rowOf('nguoi-dung-2@example.test')).getByRole('button', {
      name: /^Khóa/u,
    });
    expect(other).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(other);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    gate.resolve();
    expect(await screen.findByText(/Đã khóa tài khoản/u)).toBeInTheDocument();
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC15 hết giờ từ danh sách: báo chưa rõ kết quả, kiểm lại bằng GET, không gửi lại POST', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backend = createAdminBackend({ users: people() });
    backend.hold(isAdminPost);
    renderAdminApp('/admin/users');
    const row = await rowOf('nguoi-dung-1@example.test');
    fireEvent.click(within(row).getByRole('button', { name: /^Khóa tài khoản/u }));
    await confirmIn('Khóa tài khoản');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ADMIN_ACTION_TIMEOUT_MS + 10);
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa xác định được kết quả');
    const before = backend.requests.length;
    fireEvent.click(within(alert).getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
    await screen.findByText(/Đã tải lại/u);
    const after = backend.requests.slice(before).filter((r) => r.path.startsWith('/api/admin/'));
    expect(after.map((r) => r.method)).toEqual(['GET']);
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC15 403 sát POST từ danh sách: dọn dữ liệu, POST về muộn không ghi lại, không đăng xuất', async () => {
    const backend = createAdminBackend({ users: people() });
    const gate = deferred();
    let forbid = false;
    backend.override((request) => {
      if (isAdminPost(request)) {
        const response = json({ ...makeUser(1), status: 'LOCKED' });
        return gate.promise.then(() => response);
      }
      if (forbid && request.method === 'GET' && request.path.startsWith('/api/admin/')) {
        return apiError(403, 'FORBIDDEN');
      }
      return undefined;
    });
    const { queryClient } = renderAdminApp('/admin/users');
    const row = await rowOf('nguoi-dung-1@example.test');
    fireEvent.click(within(row).getByRole('button', { name: /^Khóa tài khoản/u }));
    await confirmIn('Khóa tài khoản');
    await waitFor(() => expect(backend.posts()).toHaveLength(1));

    forbid = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: adminUserKeys.lists(adminA.id) });
    });
    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    const hasAdminData = () =>
      queryClient
        .getQueriesData({ queryKey: adminUserKeys.all })
        .some(([, data]) => data !== undefined);
    await waitFor(() => expect(hasAdminData()).toBe(false));

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(hasAdminData()).toBe(false);
    expect(backend.requests.some((r) => r.path === '/api/auth/logout')).toBe(false);
  });

  it('UC-02.1/AC15 POST từ danh sách về muộn sau khi CÙNG tài khoản đăng nhập lại không ghi vào phiên mới', async () => {
    const backend = createAdminBackend({ users: people() });
    const gate = backend.hold(isAdminPost, { ignoreAbort: true });
    const { queryClient, auth } = renderAdminApp('/admin/users');
    const row = await rowOf('nguoi-dung-1@example.test');
    fireEvent.click(within(row).getByRole('button', { name: /^Khóa tài khoản/u }));
    await confirmIn('Khóa tài khoản');
    await waitFor(() => expect(backend.posts()).toHaveLength(1));

    await act(async () => {
      await auth().logout();
    });
    await act(async () => {
      await auth().login({ email: adminA.email, password: 'Password123' });
    });
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(screen.queryByText(/Đã khóa tài khoản/u)).not.toBeInTheDocument();
    const cached = queryClient
      .getQueriesData<{ items: { email: string; status: string }[] }>({
        queryKey: adminUserKeys.lists(adminA.id),
      })
      .flatMap(([, page]) => page?.items ?? []);
    expect(cached.find((item) => item.email === 'nguoi-dung-1@example.test')?.status).not.toBe(
      'LOCKED',
    );
  });
});
