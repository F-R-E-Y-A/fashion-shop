import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreLayout } from '@/app/StoreLayout';

import {
  type Address,
  addressKeys,
  type AdministrativeArea,
  type CreateAddressInput,
  type Profile,
  profileKeys,
} from '../api/profile-address.api.js';
import { AuthProvider } from '../AuthProvider.js';
import { RequireAuth } from '../RequireAuth.js';
import { AccountLayout } from './AccountLayout.js';
import { AddressPage } from './AddressPage.js';
import { LoginPage } from './LoginPage.js';
import { ProfilePage } from './ProfilePage.js';

vi.mock('@/features/products', () => ({
  CategoryMenu: () => <nav data-testid="mock-category-menu" />,
  SearchTrigger: () => <button type="button" aria-label="Tìm kiếm" />,
}));

const user = { id: 'user-1', email: 'customer@example.com', roles: ['CUSTOMER'] };
const authenticated = { accessToken: 'access-token', user };
const initialProfile: Profile = {
  id: user.id,
  email: user.email,
  fullName: 'Nguyễn Văn An',
  phone: '0901234567',
};
const province: AdministrativeArea = {
  id: '11111111-1111-4111-8111-111111111111',
  code: '01',
  name: 'Tỉnh Kiểm Thử',
  level: 'PROVINCE',
  parentId: null,
};
const commune: AdministrativeArea = {
  id: '22222222-2222-4222-8222-222222222222',
  code: '01001',
  name: 'Xã Kiểm Thử',
  level: 'COMMUNE',
  parentId: province.id,
};

function makeAddress(id: string, isDefault = false): Address {
  return {
    id,
    recipientName: 'Nguyễn Văn An',
    phone: '0901234567',
    administrativeAreaId: commune.id,
    administrativeArea: {
      id: commune.id,
      code: commune.code,
      name: commune.name,
      province: { id: province.id, code: province.code, name: province.name },
    },
    detailAddress: '12 Nguyễn Huệ',
    postalCode: null,
    isDefault,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function mockApi(
  options: {
    authenticated?: boolean;
    profileUpdateFails?: boolean;
    profileUnauthorizedOnce?: boolean;
    addressDeleteFails?: boolean;
    provinces?: AdministrativeArea[];
    initialAddresses?: Address[];
  } = {},
) {
  let profile = { ...initialProfile };
  let addresses = [...(options.initialAddresses ?? [])];
  let profileUnauthorized = options.profileUnauthorizedOnce ?? false;
  const requests: {
    path: string;
    method: string;
    body: unknown;
    authorization: string | undefined;
  }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization;
    requests.push({ path: `${url.pathname}${url.search}`, method, body, authorization });

    if (url.pathname === '/api/auth/refresh') {
      return options.authenticated === false
        ? response({ statusCode: 401 }, 401)
        : response(authenticated);
    }
    if (url.pathname === '/api/auth/login') return response(authenticated);
    if (url.pathname === '/api/auth/logout') return response(undefined, 204);
    if (url.pathname === '/api/cart') return response({ itemCount: 0 });
    if (url.pathname === '/api/users/me') {
      if (method === 'GET' && profileUnauthorized) {
        profileUnauthorized = false;
        return response({ statusCode: 401, code: 'UNAUTHORIZED' }, 401);
      }
      if (method === 'PATCH') {
        if (options.profileUpdateFails) return response({ statusCode: 500 }, 500);
        profile = { ...profile, ...(body as Partial<Profile>) };
      }
      return response(profile);
    }
    if (url.pathname === '/api/administrative-areas') {
      return response(
        url.searchParams.has('parentId') ? [commune] : (options.provinces ?? [province]),
      );
    }
    if (url.pathname === '/api/users/me/addresses') {
      if (method === 'POST') {
        const data = body as CreateAddressInput;
        const isDefault = addresses.length === 0 || data.isDefault === true;
        const created = {
          ...makeAddress('address-new', isDefault),
          ...data,
          isDefault,
        };
        if (created.isDefault) addresses = addresses.map((item) => ({ ...item, isDefault: false }));
        addresses.push(created);
        return response(created, 201);
      }
      return response(addresses);
    }
    if (url.pathname.startsWith('/api/users/me/addresses/')) {
      const id = url.pathname.split('/').at(-1);
      if (method === 'DELETE') {
        if (options.addressDeleteFails) return response({ statusCode: 500 }, 500);
        addresses = addresses.filter((item) => item.id !== id);
        return response(undefined, 204);
      }
      const data = body as Partial<Address>;
      if (data.isDefault) addresses = addresses.map((item) => ({ ...item, isDefault: false }));
      addresses = addresses.map((item) => (item.id === id ? { ...item, ...data } : item));
      return response(addresses.find((item) => item.id === id));
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests };
}

function renderAccount(path: string, withStoreLayout = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={withStoreLayout ? <StoreLayout /> : undefined}>
              <Route element={<RequireAuth />}>
                <Route path="/tai-khoan" element={<AccountLayout />}>
                  <Route path="ho-so" element={<ProfilePage />} />
                  <Route path="dia-chi" element={<AddressPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UC-01.5 Hồ sơ cá nhân trên web', () => {
  it('hiện lối vào hồ sơ và sổ địa chỉ trên header sau đăng nhập', async () => {
    mockApi();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter>
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<p>Cửa hàng</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole('button', { name: /Tài khoản: / })).toBeInTheDocument();
    // Link tai khoan nam trong dropdown avatar: mo ra roi moi thay.
    fireEvent.click(screen.getByRole('button', { name: /Tài khoản: / }));
    expect(await screen.findByRole('link', { name: 'Hồ sơ cá nhân' })).toHaveAttribute(
      'href',
      '/tai-khoan/ho-so',
    );
    expect(screen.getByRole('link', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đơn hàng của tôi' })).toHaveAttribute(
      'href',
      '/tai-khoan/don-hang',
    );
    // So dia chi khong con tren header: no la tab con cua /tai-khoan.
    expect(screen.queryByRole('link', { name: 'Sổ địa chỉ' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
  });

  it('hiển thị hồ sơ và chỉ gửi fullName/phone thay đổi', async () => {
    const { requests } = mockApi();
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/ho-so');

    expect(await screen.findByDisplayValue('customer@example.com')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('Nguyễn Văn An')).toBeInTheDocument();
    await actor.clear(screen.getByLabelText('Họ tên'));
    await actor.type(screen.getByLabelText('Họ tên'), 'Nguyễn Văn Bình');
    await actor.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByText('Đã cập nhật hồ sơ.')).toBeInTheDocument();
    const patchRequest = requests.find(
      (item) => item.method === 'PATCH' && item.path === '/api/users/me',
    );
    expect(patchRequest?.body).toEqual({ fullName: 'Nguyễn Văn Bình' });
    expect(patchRequest?.authorization).toBe('Bearer access-token');
  });

  it('hiển thị lỗi API và không sửa email', async () => {
    const { requests } = mockApi({ profileUpdateFails: true });
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/ho-so');

    await screen.findByDisplayValue('Nguyễn Văn An');
    await actor.clear(screen.getByLabelText('Số điện thoại'));
    await actor.type(screen.getByLabelText('Số điện thoại'), '0912345678');
    await actor.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể cập nhật hồ sơ');
    expect(requests.some((item) => item.method === 'PATCH' && item.path === '/api/users/me')).toBe(
      true,
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  });

  it('refresh access token rồi tải lại hồ sơ khi API trả 401', async () => {
    const { requests } = mockApi({ profileUnauthorizedOnce: true });
    renderAccount('/tai-khoan/ho-so');

    expect(await screen.findByDisplayValue('Nguyễn Văn An')).toBeInTheDocument();
    expect(requests.filter((item) => item.path === '/api/auth/refresh')).toHaveLength(2);
    expect(requests.filter((item) => item.path === '/api/users/me')).toHaveLength(2);
  });

  it('chặn khách chưa đăng nhập và trở về hồ sơ sau login', async () => {
    mockApi({ authenticated: false });
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/ho-so');

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    await actor.type(screen.getByLabelText('Email'), 'customer@example.com');
    await actor.type(screen.getByLabelText('Mật khẩu'), 'Password123');
    await actor.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeInTheDocument();
  });

  it('đăng xuất ở trang tài khoản chỉ xóa cache hồ sơ và địa chỉ', async () => {
    mockApi({ initialAddresses: [makeAddress('address-1', true)] });
    const actor = userEvent.setup();
    const { queryClient } = renderAccount('/tai-khoan/ho-so', true);

    expect(await screen.findByDisplayValue('Nguyễn Văn An')).toBeInTheDocument();
    queryClient.setQueryData(addressKeys.list(user.id), [makeAddress('address-1', true)]);
    queryClient.setQueryData(['unrelated'], { retained: true });
    // Đăng xuất nằm trong dropdown avatar: mở ra rồi bấm.
    await actor.click(screen.getByRole('button', { name: /Tài khoản: / }));
    await actor.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(queryClient.getQueryData(profileKeys.current(user.id))).toBeUndefined();
    expect(queryClient.getQueryData(addressKeys.list(user.id))).toBeUndefined();
    expect(queryClient.getQueryData(['unrelated'])).toEqual({ retained: true });
  });
});

describe('UC-01.6 Sổ địa chỉ trên web', () => {
  it('liệt kê địa chỉ và chỉ báo mặc định cho địa chỉ tương ứng', async () => {
    mockApi({ initialAddresses: [makeAddress('address-1', true)] });
    renderAccount('/tai-khoan/dia-chi');

    expect(await screen.findByText('12 Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getByText('Xã Kiểm Thử, Tỉnh Kiểm Thử')).toBeInTheDocument();
    expect(screen.getByText('Mặc định')).toBeInTheDocument();
  });

  it('tạo địa chỉ bằng tỉnh/xã từ API', async () => {
    const { requests } = mockApi();
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('Bạn chưa có địa chỉ nào.');
    await actor.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }));
    await screen.findByRole('option', { name: 'Tỉnh Kiểm Thử' });
    await actor.type(screen.getByLabelText('Tên người nhận'), 'Nguyễn Văn An');
    await actor.type(screen.getByLabelText('Số điện thoại'), '0901234567');
    await actor.selectOptions(screen.getByLabelText('Tỉnh / thành phố'), province.id);
    await screen.findByRole('option', { name: 'Xã Kiểm Thử' });
    await actor.selectOptions(screen.getByLabelText('Xã / phường'), commune.id);
    await actor.type(screen.getByLabelText('Địa chỉ chi tiết'), '12 Nguyễn Huệ');
    await actor.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }));

    expect(await screen.findByText('Đã thêm địa chỉ.')).toBeInTheDocument();
    expect(screen.getByText('Mặc định')).toBeInTheDocument();
    expect(
      requests.find((item) => item.method === 'POST' && item.path === '/api/users/me/addresses'),
    ).toMatchObject({
      body: {
        recipientName: 'Nguyễn Văn An',
        phone: '0901234567',
        administrativeAreaId: commune.id,
        detailAddress: '12 Nguyễn Huệ',
      },
    });
  });

  it('sửa địa chỉ và đặt mặc định qua PATCH', async () => {
    const { requests } = mockApi({
      initialAddresses: [makeAddress('address-1', true), makeAddress('address-2')],
    });
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    const cards = await screen.findAllByRole('article');
    await actor.click(within(cards[1]).getByRole('button', { name: 'Sửa' }));
    await screen.findByRole('option', { name: 'Xã Kiểm Thử' });
    await actor.clear(screen.getByLabelText('Địa chỉ chi tiết'));
    await actor.type(screen.getByLabelText('Địa chỉ chi tiết'), '34 Lê Lợi');
    await actor.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }));
    expect(await screen.findByText('Đã cập nhật địa chỉ.')).toBeInTheDocument();
    expect(
      requests.find((item) => item.method === 'PATCH' && item.path.endsWith('/address-2')),
    ).toMatchObject({ body: { detailAddress: '34 Lê Lợi' } });

    const updatedCards = screen.getAllByRole('article');
    await actor.click(within(updatedCards[1]).getByRole('button', { name: 'Đặt mặc định' }));
    expect(await screen.findByText('Đã đổi địa chỉ mặc định.')).toBeInTheDocument();
    expect(
      requests.some(
        (item) =>
          item.method === 'PATCH' &&
          item.path.endsWith('/address-2') &&
          (item.body as { isDefault?: boolean }).isDefault === true,
      ),
    ).toBe(true);
  });

  it('yêu cầu xác nhận trước khi xóa', async () => {
    const { requests } = mockApi({ initialAddresses: [makeAddress('address-1', true)] });
    const actor = userEvent.setup();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('12 Nguyễn Huệ');
    await actor.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(requests.some((item) => item.method === 'DELETE')).toBe(false);
    await actor.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByText('Đã xóa địa chỉ.')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(
      requests.some((item) => item.method === 'DELETE' && item.path.endsWith('/address-1')),
    ).toBe(true);
  });

  it('đóng form sửa khi xóa chính địa chỉ đang sửa', async () => {
    mockApi({ initialAddresses: [makeAddress('address-1', true)] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('12 Nguyễn Huệ');
    await actor.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('heading', { name: 'Sửa địa chỉ' })).toBeInTheDocument();
    await actor.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText('Đã xóa địa chỉ.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sửa địa chỉ' })).not.toBeInTheDocument();
  });

  it('làm mới danh sách sau khi xóa thất bại', async () => {
    const { requests } = mockApi({
      addressDeleteFails: true,
      initialAddresses: [makeAddress('address-1', true)],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('12 Nguyễn Huệ');
    await actor.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xóa địa chỉ');
    await waitFor(() =>
      expect(
        requests.filter((item) => item.method === 'GET' && item.path === '/api/users/me/addresses'),
      ).toHaveLength(2),
    );
    expect(screen.getByText('12 Nguyễn Huệ')).toBeInTheDocument();
  });

  it('báo rõ khi API chưa có dữ liệu tỉnh/xã', async () => {
    mockApi({ provinces: [] });
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('Bạn chưa có địa chỉ nào.');
    await actor.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }));
    expect(await screen.findByText(/Chưa có dữ liệu tỉnh\/xã/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu địa chỉ' })).toBeDisabled();
  });

  it('vẫn sửa được thông tin khác của địa chỉ cũ khi danh mục tỉnh trống', async () => {
    const { requests } = mockApi({
      provinces: [],
      initialAddresses: [makeAddress('address-1', true)],
    });
    const actor = userEvent.setup();
    renderAccount('/tai-khoan/dia-chi');

    await screen.findByText('12 Nguyễn Huệ');
    await actor.click(screen.getByRole('button', { name: 'Sửa' }));
    await screen.findByText(/Bạn vẫn có thể sửa các thông tin khác/);
    await actor.clear(screen.getByLabelText('Địa chỉ chi tiết'));
    await actor.type(screen.getByLabelText('Địa chỉ chi tiết'), '34 Lê Lợi');
    await actor.click(screen.getByRole('button', { name: 'Lưu địa chỉ' }));

    expect(await screen.findByText('Đã cập nhật địa chỉ.')).toBeInTheDocument();
    const patchRequest = requests.find((item) => item.method === 'PATCH');
    expect(patchRequest?.body).not.toHaveProperty('administrativeAreaId');
  });
});
