import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreLayout } from '@/app/StoreLayout';

import { AuthProvider, useAuth } from './AuthProvider.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';

const authenticated = {
  accessToken: 'access-token',
  user: { id: 'user-1', email: 'customer@example.com', roles: ['CUSTOMER'] },
};

const unauthorized = {
  statusCode: 401,
  code: 'UNAUTHORIZED',
  message: 'Khong duoc phep truy cap',
  path: '/auth/refresh',
  timestamp: new Date().toISOString(),
};

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function mockFetch(...responses: Response[]) {
  vi.mocked(fetch).mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fetch');
    return response;
  });
}

function renderWithRoutes(initialPath: '/login' | '/register') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<p>Đã đăng nhập</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function renderStore() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Routes>
          <Route element={<StoreLayout />}>
            <Route index element={<p>Cửa hàng</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function AuthenticatedProbe() {
  const { authenticatedRequest, isLoading } = useAuth();
  const [result, setResult] = useState('');

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => {
        void authenticatedRequest<{ value: string }>('/protected').then((response) =>
          setResult(response.value),
        );
      }}
    >
      {result || 'Gọi API bảo vệ'}
    </button>
  );
}

describe('Account authentication (PH3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows guest navbar after bootstrap cannot refresh a session', async () => {
    mockFetch(
      mockResponse(
        {
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Khong duoc phep truy cap',
          path: '/auth/refresh',
          timestamp: new Date().toISOString(),
        },
        401,
      ),
    );

    renderStore();

    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toBeInTheDocument();
  });

  it('restores an authenticated navbar and logout clears its local state', async () => {
    mockFetch(mockResponse(authenticated), mockResponse(undefined, 204));
    const user = userEvent.setup();

    renderStore();

    expect(await screen.findByText('customer@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
  });

  it('refreshes once and retries an authenticated request once after a 401', async () => {
    const renewed = { ...authenticated, accessToken: 'renewed-access-token' };
    mockFetch(
      mockResponse(authenticated),
      mockResponse(unauthorized, 401),
      mockResponse(renewed),
      mockResponse({ value: 'ok' }),
    );
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthenticatedProbe />
      </AuthProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Gọi API bảo vệ' }));
    expect(await screen.findByRole('button', { name: 'ok' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(vi.mocked(fetch).mock.calls[3]?.[1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: 'Bearer renewed-access-token' }),
    });
  });

  it('logs in and navigates with in-memory authentication state', async () => {
    mockFetch(mockResponse({}, 401), mockResponse(authenticated));
    const user = userEvent.setup();

    renderWithRoutes('/login');
    await user.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Đã đăng nhập')).toBeInTheDocument();
  });

  it('shows a generic login error', async () => {
    mockFetch(mockResponse({}, 401), mockResponse({}, 401));
    const user = userEvent.setup();

    renderWithRoutes('/login');
    await user.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'WrongPassword123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
  });

  it('registers and navigates with in-memory authentication state', async () => {
    mockFetch(mockResponse({}, 401), mockResponse(authenticated));
    const user = userEvent.setup();

    renderWithRoutes('/register');
    await user.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText('Đã đăng nhập')).toBeInTheDocument();
  });

  it('shows a clear register error', async () => {
    mockFetch(mockResponse({}, 401), mockResponse({}, 400));
    const user = userEvent.setup();

    renderWithRoutes('/register');
    await user.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'weakpass');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể đăng ký. Hãy kiểm tra thông tin và thử lại.',
    );
  });
});
