import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminUserKeys } from './admin-users.api.js';
import { ADMIN_ACTION_TIMEOUT_MS } from './AdminUserDetailPage.js';
import {
  adminA,
  apiError,
  asAdminUser,
  createAdminBackend,
  customer,
  deferred,
  installDialogStub,
  json,
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
  AdminProductsPage: () => <p>Tổng quan sản phẩm của Bảo</p>,
}));
vi.mock('@/features/cart', () => ({
  cartKeys: { all: ['cart'], current: () => ['cart', 'current'] },
  getCart: async () => ({ items: [], itemCount: 0 }),
  mergeCart: async () => null,
  CartPage: () => <p>Trang giỏ hàng</p>,
}));

const location = () => screen.getByTestId('location');
const isAdminPost = (request: RecordedRequest) =>
  request.method === 'POST' && request.path.startsWith('/api/admin/');
const nav = () => screen.queryByRole('navigation', { name: 'Điều hướng quản trị' });

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

describe('UC-02.1 Quản trị tài khoản — cổng ADMIN và đường dẫn', () => {
  it('UC-02.1/AC1 đang khôi phục phiên chỉ hiện trạng thái tải, không dựng khung quản trị', async () => {
    const backend = createAdminBackend({});
    const refresh = backend.hold((request) => request.path === '/api/auth/refresh');
    renderAdminApp('/admin/users');

    expect(screen.getByRole('status')).toHaveTextContent('Đang kiểm tra quyền truy cập…');
    expect(nav()).not.toBeInTheDocument();
    expect(backend.adminRequests()).toHaveLength(0);

    refresh.resolve();
    expect(await screen.findByRole('heading', { name: 'Người dùng' })).toBeInTheDocument();
  });

  it('UC-02.1/AC1 khách chưa đăng nhập về /login, đăng nhập ADMIN xong quay lại đúng /admin/users?page=2', async () => {
    const users = [asAdminUser(adminA), ...Array.from({ length: 24 }, (_, i) => makeUser(i + 1))];
    const backend = createAdminBackend({ session: null, users });
    renderAdminApp('/admin/users?page=2');

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(nav()).not.toBeInTheDocument();
    expect(backend.adminRequests()).toHaveLength(0);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: adminA.email } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?page=2'));
    expect(await screen.findByText('nguoi-dung-20@example.test')).toBeInTheDocument();
    expect(backend.adminRequests()[0]?.path).toBe('/api/admin/users?page=2&pageSize=20');
  });

  it('UC-02.1/AC1 CUSTOMER thấy không đủ quyền và không phát request quản trị nào', async () => {
    const backend = createAdminBackend({ session: customer });
    renderAdminApp('/admin/users/10000000-0000-4000-8000-000000000001');

    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về cửa hàng' })).toHaveAttribute('href', '/');
    expect(nav()).not.toBeInTheDocument();
    expect(backend.adminRequests()).toHaveLength(0);
  });

  it('UC-02.1/AC2 /quan-tri chuyển hướng replace về /admin, giữ query và hash; Tổng quan của Bảo vẫn hiện', async () => {
    createAdminBackend({});
    renderAdminApp('/quan-tri?tab=1#tong-quan');

    expect(await screen.findByText('Tổng quan sản phẩm của Bảo')).toBeInTheDocument();
    expect(location()).toHaveTextContent('/admin?tab=1#tong-quan');
    expect(location()).toHaveAttribute('data-navigation', 'REPLACE');

    const links = within(nav() as HTMLElement).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Tổng quan', 'Người dùng']);
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '← Về cửa hàng' })).toHaveAttribute('href', '/');
  });

  it('UC-02.1/AC2 page sai chuẩn hóa về /admin/users bằng replace, không gọi API với page sai', async () => {
    for (const raw of ['0', '-1', 'abc', '1.5', '1e3', '9999999']) {
      const backend = createAdminBackend({});
      renderAdminApp(`/admin/users?page=${raw}`);
      expect(await screen.findByText('nguoi-dung-1@example.test')).toBeInTheDocument();
      expect(location()).toHaveTextContent(/^\/admin\/users$/u);
      expect(location()).toHaveAttribute('data-navigation', 'REPLACE');
      expect(backend.adminRequests().map((item) => item.path)).toEqual([
        '/api/admin/users?page=1&pageSize=20',
      ]);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('UC-02.1/AC2 trang vượt giới hạn hiện rỗng và link về trang hợp lệ', async () => {
    const users = [asAdminUser(adminA), ...Array.from({ length: 24 }, (_, i) => makeUser(i + 1))];
    createAdminBackend({ users });
    renderAdminApp('/admin/users?page=9');

    expect(await screen.findByText('Trang 9 không có dữ liệu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Về trang 2' }));
    expect(await screen.findByText('nguoi-dung-24@example.test')).toBeInTheDocument();
    expect(location()).toHaveTextContent('/admin/users?page=2');
  });

  it('UC-02.1/AC2 chuyển trang ghi ?page, chi tiết quay lại đúng trang đã xem', async () => {
    const users = [asAdminUser(adminA), ...Array.from({ length: 24 }, (_, i) => makeUser(i + 1))];
    createAdminBackend({ users });
    renderAdminApp('/admin/users');

    await screen.findByText('nguoi-dung-1@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?page=2'));
    fireEvent.click(await screen.findByRole('link', { name: 'nguoi-dung-21@example.test' }));

    expect(
      await screen.findByRole('heading', { name: 'nguoi-dung-21@example.test' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Người dùng' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    fireEvent.click(screen.getByRole('link', { name: '← Danh sách người dùng' }));
    await waitFor(() => expect(location()).toHaveTextContent('/admin/users?page=2'));
  });

  it('UC-02.1/AC1 link Quản trị ở cửa hàng chỉ hiện cho ADMIN và trỏ tới /admin', async () => {
    createAdminBackend({ session: customer });
    renderAdminApp('/');
    await screen.findByRole('button', { name: /Tài khoản: / });
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
    cleanup();
    vi.unstubAllGlobals();

    createAdminBackend({});
    renderAdminApp('/');
    expect(await screen.findByRole('link', { name: 'Quản trị' })).toHaveAttribute('href', '/admin');
  });
});

describe('UC-02.1 Quản trị tài khoản — danh sách và chi tiết', () => {
  it('UC-02.1/AC3 danh sách gửi pageSize=20, tổng từ total, chỉ hiện trường trong allowlist', async () => {
    const backend = createAdminBackend({});
    backend.override((request) => {
      if (request.path !== '/api/admin/users?page=1&pageSize=20') return undefined;
      const leaked = {
        ...makeUser(1),
        passwordHash: 'BI-MAT-HASH',
        fullName: 'Tên Bịa',
        phone: '0900000000',
      };
      return new Response(
        JSON.stringify({ items: [leaked], total: 128, page: 1, pageSize: 20, totalPages: 7 }),
        { status: 200 },
      );
    });
    renderAdminApp('/admin/users');

    const row = (await screen.findByRole('link', { name: 'nguoi-dung-1@example.test' })).closest(
      'tr',
    );
    expect(screen.getByText('128 tài khoản')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Khách hàng')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText(/Trang 1 trên 7 · 128 tài khoản/u)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('BI-MAT-HASH');
    expect(document.body).not.toHaveTextContent('Tên Bịa');
    expect(document.body).not.toHaveTextContent('0900000000');
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Email',
      'Vai',
      'Trạng thái',
      'Xác thực email',
      'Ngày tạo',
    ]);
  });

  it('UC-02.1/AC3 danh sách lỗi 500 thử lại đúng một lần rồi cho người dùng thử lại', async () => {
    const backend = createAdminBackend({});
    let failures = 2;
    backend.override((request) =>
      request.path.startsWith('/api/admin/users?') && failures-- > 0
        ? apiError(500, 'INTERNAL_SERVER_ERROR')
        : undefined,
    );
    renderAdminApp('/admin/users');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không tải được danh sách người dùng',
    );
    expect(backend.adminRequests()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại →' }));
    expect(await screen.findByText('nguoi-dung-1@example.test')).toBeInTheDocument();
  });

  it('UC-02.1/AC3 chi tiết 404 và id sai dạng (400) hiện không tìm thấy, không thử lại', async () => {
    for (const id of ['10000000-0000-4000-8000-999999999999', 'khong-phai-uuid']) {
      const backend = createAdminBackend({});
      renderAdminApp(`/admin/users/${id}`);
      expect(
        await screen.findByRole('heading', { name: 'Không tìm thấy tài khoản' }),
      ).toBeInTheDocument();
      expect(backend.adminRequests()).toHaveLength(1);
      expect(screen.getByRole('link', { name: '← Danh sách người dùng' })).toHaveAttribute(
        'href',
        '/admin/users',
      );
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('UC-02.1/AC4 ma trận nút: khóa chỉ cho ACTIVE không phải mình, không ADMIN; LOCKED có mở khóa', async () => {
    const cases = [
      { user: makeUser(1), expect: 'Khóa tài khoản' },
      { user: makeUser(2, { status: 'LOCKED' }), expect: 'Mở khóa tài khoản' },
      { user: makeUser(3, { status: 'LOCKED', roles: ['ADMIN'] }), expect: 'Mở khóa tài khoản' },
      {
        user: makeUser(4, { roles: ['ADMIN'] }),
        reason: 'Tài khoản quản trị viên không khóa được',
      },
      { user: makeUser(5, { status: 'PENDING_VERIFICATION' }), reason: 'Chỉ khóa được tài khoản' },
      { user: makeUser(6, { status: 'DISABLED' }), reason: 'Chỉ khóa được tài khoản' },
      { user: asAdminUser(adminA), reason: 'Đây là tài khoản của bạn' },
    ];
    for (const item of cases) {
      createAdminBackend({ users: [asAdminUser(adminA), item.user] });
      renderAdminApp(`/admin/users/${item.user.id}`);
      const panel = (await screen.findByRole('heading', { name: 'Thao tác' })).closest('section');
      const buttons = within(panel as HTMLElement).queryAllByRole('button');
      if (item.expect) {
        expect(buttons.map((button) => button.textContent)).toEqual([item.expect]);
      } else {
        expect(buttons).toHaveLength(0);
        expect(panel).toHaveTextContent(item.reason as string);
      }
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});

describe('UC-02.1 Quản trị tài khoản — khóa, mở khóa và hộp xác nhận', () => {
  // Backend gia doi trang thai tren chinh doi tuong nay: moi bai mot ban moi.
  let target = makeUser(7);
  beforeEach(() => {
    target = makeUser(7);
  });

  async function openLockDialog() {
    const opener = await screen.findByRole('button', { name: 'Khóa tài khoản' });
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Khóa tài khoản này?' });
    return { opener, dialog };
  }

  it('UC-02.1/AC5 hộp xác nhận nêu tác động; Hủy không gọi API và trả focus về nút mở', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    renderAdminApp(`/admin/users/${target.id}`);
    const { opener, dialog } = await openLockDialog();

    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription(/đăng xuất khỏi mọi thiết bị/u);
    expect(dialog).toHaveTextContent('Không đăng nhập được cho tới khi được mở khóa.');
    expect(dialog).toHaveTextContent('Mở khóa sau này không khôi phục phiên cũ');
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(backend.posts()).toHaveLength(0);
  });

  it('UC-02.1/AC7 Tab và Shift+Tab vòng trong hộp; Esc (sự kiện cancel) đóng và trả focus', async () => {
    createAdminBackend({ users: [asAdminUser(adminA), target] });
    const actor = userEvent.setup();
    renderAdminApp(`/admin/users/${target.id}`);
    const { opener, dialog } = await openLockDialog();
    const cancel = within(dialog).getByRole('button', { name: 'Hủy' });
    const confirm = within(dialog).getByRole('button', { name: 'Khóa tài khoản' });

    await actor.tab();
    expect(confirm).toHaveFocus();
    await actor.tab();
    expect(cancel).toHaveFocus();
    await actor.tab({ shift: true });
    expect(confirm).toHaveFocus();

    // Trinh duyet phat `cancel` khi bam Esc; stub jsdom khong tu lam viec nay.
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('UC-02.1/AC5 khóa thành công cập nhật chi tiết và danh sách đã cache, focus vào thông báo', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    const { queryClient } = renderAdminApp('/admin/users');
    fireEvent.click(await screen.findByRole('link', { name: target.email }));
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    const notice = await screen.findByText(/Đã khóa tài khoản/u);
    expect(notice.closest('[tabindex="-1"]')).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument();
    expect(backend.posts().map((item) => item.path)).toEqual([
      `/api/admin/users/${target.id}/lock`,
    ]);
    expect(backend.posts()[0]?.authorization).toMatch(/^Bearer /u);

    // Danh sach da cache doi ngay, truoc khi lan tai lai (dang bi giu) tra ve.
    const listGate = backend.hold((request) => request.path.startsWith('/api/admin/users?'));
    const cached = queryClient.getQueryData<{ items: { id: string; status: string }[] }>(
      adminUserKeys.list(adminA.id, 1),
    );
    expect(cached?.items.find((item) => item.id === target.id)?.status).toBe('LOCKED');
    fireEvent.click(screen.getByRole('link', { name: '← Danh sách người dùng' }));
    const row = (await screen.findByRole('link', { name: target.email })).closest('tr');
    expect(within(row as HTMLElement).getByText('Đã khóa')).toBeInTheDocument();
    listGate.resolve();
  });

  it('UC-02.1/AC5 mở khóa thành công cập nhật trạng thái và nói rõ không khôi phục phiên', async () => {
    const locked = makeUser(8, { status: 'LOCKED' });
    createAdminBackend({ users: [asAdminUser(adminA), locked] });
    renderAdminApp(`/admin/users/${locked.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở khóa tài khoản' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mở khóa tài khoản này?' });
    expect(dialog).toHaveTextContent('Không phiên nào được khôi phục tự động.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mở khóa' }));

    expect(await screen.findByText(/Đã mở khóa tài khoản/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khóa tài khoản' })).toBeInTheDocument();
  });

  it('UC-02.1/AC6 bấm xác nhận ba lần hoặc Enter liên tiếp chỉ gửi một POST', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    const actor = userEvent.setup();
    const gate = backend.hold(isAdminPost);
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Khóa tài khoản' });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    confirm.focus();
    await actor.keyboard('{Enter}{Enter}');
    expect(backend.posts()).toHaveLength(1);
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveFocus();

    gate.resolve();
    expect(await screen.findByText(/Đã khóa tài khoản/u)).toBeInTheDocument();
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC7 đang xử lý: đóng hộp không hủy thao tác, kết quả hiện trên trang', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    const gate = backend.hold(isAdminPost);
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Đóng hộp này không hủy thao tác',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Đang khóa…', { selector: 'p' })).toBeInTheDocument();

    gate.resolve();
    expect(await screen.findByText(/Đã khóa tài khoản/u)).toBeInTheDocument();
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC7 hết giờ chờ báo chưa rõ kết quả, không gửi lại POST; kiểm lại bằng GET', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    backend.hold(isAdminPost);
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ADMIN_ACTION_TIMEOUT_MS + 10);
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chưa xác định được kết quả');
    expect(backend.posts()).toHaveLength(1);

    // May chu thuc ra da khoa (vd phan hoi bi mat tren duong ve): GET kiem lai thay LOCKED.
    target.status = 'LOCKED';
    const gets = backend.adminRequests().length;
    fireEvent.click(within(alert).getByRole('button', { name: 'Kiểm tra lại trạng thái' }));
    expect(await screen.findByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument();
    expect(
      backend
        .adminRequests()
        .slice(gets)
        .map((item) => item.method),
    ).toEqual(['GET']);
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC6 409 tải lại trạng thái; 422 hiện lý do; không tự gửi lại', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    backend.override((request) => {
      if (!isAdminPost(request)) return undefined;
      target.status = 'LOCKED'; // quan tri vien khac vua khoa truoc
      return apiError(409, 'USER_NOT_ACTIVE');
    });
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('vừa thay đổi ở nơi khác');
    expect(await screen.findByRole('button', { name: 'Mở khóa tài khoản' })).toBeInTheDocument();
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC6 422 CANNOT_LOCK_SELF hiện lý do rõ ràng', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    backend.override((request) =>
      isAdminPost(request) ? apiError(422, 'CANNOT_LOCK_SELF') : undefined,
    );
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('không thể tự khóa');
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC6 403 khi khóa hiện không đủ quyền và xóa dữ liệu quản trị, không đăng xuất', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    backend.override((request) => (isAdminPost(request) ? apiError(403, 'FORBIDDEN') : undefined));
    const { queryClient } = renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(
      await screen.findByRole('heading', { name: 'Không đủ quyền truy cập' }),
    ).toBeInTheDocument();
    // Query bi tat co the con giu khoa, nhung khong con du lieu tai khoan nao cua actor.
    const cached = queryClient.getQueriesData({ queryKey: adminUserKeys.all });
    expect(cached.every(([, data]) => data === undefined)).toBe(true);
    expect(document.body).not.toHaveTextContent(target.email);
    expect(backend.requests.some((item) => item.path === '/api/auth/logout')).toBe(false);
    expect(backend.posts()).toHaveLength(1);
  });

  it('UC-02.1/AC6 401 làm mới phiên qua authenticatedRequest rồi gửi lại với token mới', async () => {
    const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
    let rejectOnce = true;
    backend.override((request) => {
      if (!isAdminPost(request) || !rejectOnce) return undefined;
      rejectOnce = false;
      return apiError(401, 'UNAUTHORIZED');
    });
    renderAdminApp(`/admin/users/${target.id}`);
    const { dialog } = await openLockDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(await screen.findByText(/Đã khóa tài khoản/u)).toBeInTheDocument();
    const [first, second] = backend.posts();
    expect(first?.authorization).not.toBe(second?.authorization);
    expect(backend.requests.filter((item) => item.path === '/api/auth/refresh')).toHaveLength(2);
  });
});

describe('UC-02.1 Quản trị tài khoản — kết quả đến muộn (review Codex)', () => {
  const cases = [
    {
      action: 'lock',
      from: 'ACTIVE',
      to: 'LOCKED',
      open: 'Khóa tài khoản',
      confirm: 'Khóa tài khoản',
    },
    {
      action: 'unlock',
      from: 'LOCKED',
      to: 'ACTIVE',
      open: 'Mở khóa tài khoản',
      confirm: 'Mở khóa',
    },
  ] as const;

  async function runAction(open: string, confirm: string) {
    fireEvent.click(await screen.findByRole('button', { name: open }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: confirm }));
  }

  it.each(cases)(
    'UC-02.1/AC5 GET chi tiết và danh sách đọc trước khi $action, về sau, không đè trạng thái $to',
    async ({ action, from, to, open, confirm }) => {
      const target = makeUser(11, { status: from });
      const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
      const { queryClient } = renderAdminApp('/admin/users');
      fireEvent.click(await screen.findByRole('link', { name: target.email }));
      await screen.findByRole('heading', { name: target.email });

      // Hai GET doc trang thai cu roi bi giu: chung ve SAU khi POST thanh cong.
      const gate = deferred();
      const stale = { ...target, status: from };
      let heldDetail = false;
      let heldList = false;
      backend.override((request) => {
        if (request.method !== 'GET') return undefined;
        if (request.path.endsWith(target.id) && !heldDetail) {
          heldDetail = true;
          const response = json(stale);
          return gate.promise.then(() => response);
        }
        if (request.path.startsWith('/api/admin/users?') && !heldList) {
          heldList = true;
          const response = json({
            items: [asAdminUser(adminA), stale],
            total: 2,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          });
          return gate.promise.then(() => response);
        }
        return undefined;
      });
      act(() => {
        void queryClient.refetchQueries({ queryKey: adminUserKeys.actor(adminA.id), type: 'all' });
      });
      await waitFor(() => expect(heldDetail && heldList).toBe(true));

      await runAction(open, confirm);
      expect(
        await screen.findByText(new RegExp(action === 'lock' ? 'Đã khóa' : 'Đã mở khóa', 'u'), {
          selector: 'p',
        }),
      ).toBeInTheDocument();
      expect(backend.posts().map((item) => item.path)).toEqual([
        `/api/admin/users/${target.id}/${action}`,
      ]);

      await act(async () => {
        gate.resolve();
        await gate.promise;
      });
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));

      const detailData = queryClient.getQueryData<{ status: string }>(
        adminUserKeys.detail(adminA.id, target.id),
      );
      const listData = queryClient.getQueryData<{ items: { id: string; status: string }[] }>(
        adminUserKeys.list(adminA.id, 1),
      );
      expect(detailData?.status).toBe(to);
      expect(listData?.items.find((item) => item.id === target.id)?.status).toBe(to);
      expect(
        screen.getByRole('button', {
          name: action === 'lock' ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
        }),
      ).toBeInTheDocument();
    },
  );

  it.each(cases)(
    'UC-02.1/AC6 POST $action đã xử lý, trả thành công sau khi trang nhận 403, không đưa dữ liệu quản trị trở lại cache',
    async ({ action, from, open, confirm }) => {
      const target = makeUser(12, { status: from });
      const backend = createAdminBackend({ users: [asAdminUser(adminA), target] });
      const gate = deferred();
      let forbid = false;
      backend.override((request) => {
        if (request.method === 'POST' && request.path.endsWith(`/${action}`)) {
          const response = json({ ...target, status: action === 'lock' ? 'LOCKED' : 'ACTIVE' });
          return gate.promise.then(() => response);
        }
        if (forbid && request.method === 'GET') return apiError(403, 'FORBIDDEN');
        return undefined;
      });
      const { queryClient } = renderAdminApp(`/admin/users/${target.id}`);
      await runAction(open, confirm);
      await waitFor(() => expect(backend.posts()).toHaveLength(1));

      forbid = true;
      act(() => {
        void queryClient.invalidateQueries({
          queryKey: adminUserKeys.detail(adminA.id, target.id),
        });
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
      expect(screen.getByRole('heading', { name: 'Không đủ quyền truy cập' })).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(target.email);
      expect(backend.posts()).toHaveLength(1);
    },
  );
});
