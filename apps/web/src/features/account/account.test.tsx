import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreLayout } from '@/app/StoreLayout';

import { AuthProvider, useAuth } from './AuthProvider.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { VerifyEmailPage } from './pages/VerifyEmailPage.js';

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
          <Route path="/xac-thuc-email" element={<VerifyEmailPage />} />
          <Route path="/" element={<p>Đã đăng nhập</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

/** VerifyEmailPage does not use AuthProvider: it only calls the OTP endpoints directly. */
function renderVerifyPage(initialEmail = 'customer@example.com') {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/xac-thuc-email', state: { email: initialEmail } }]}
    >
      <Routes>
        <Route path="/xac-thuc-email" element={<VerifyEmailPage />} />
        <Route path="/login" element={<p>Trang đăng nhập</p>} />
      </Routes>
    </MemoryRouter>,
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

  it('registers and navigates to the verify-email page without authenticating', async () => {
    mockFetch(
      mockResponse({}, 401),
      mockResponse({ verificationRequired: true, email: 'customer@example.com' }, 201),
    );
    const user = userEvent.setup();

    renderWithRoutes('/register');
    await user.type(await screen.findByLabelText('Email'), 'customer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText(/Nhập mã 6 số/)).toBeInTheDocument();
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

  it('shows an email-not-verified message with a link to verify-email on login', async () => {
    mockFetch(
      mockResponse({}, 401),
      mockResponse(
        {
          statusCode: 401,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Tai khoan chua xac thuc email',
          path: '/auth/login',
          timestamp: new Date().toISOString(),
        },
        401,
      ),
    );
    const user = userEvent.setup();

    renderWithRoutes('/login');
    await user.type(await screen.findByLabelText('Email'), 'pending@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email chưa được xác thực.');
    expect(screen.getByRole('link', { name: 'Xác thực ngay' })).toBeInTheDocument();
  });

  it('verifies the OTP and shows a success state with a login CTA', async () => {
    mockFetch(mockResponse({ verified: true }));
    const user = userEvent.setup();

    renderVerifyPage();
    await user.type(screen.getByLabelText('Mã xác thực'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực' }));

    expect(await screen.findByRole('status')).toHaveTextContent('đã được xác thực');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }));
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
  });

  it('shows an invalid-code error and lets the user retry', async () => {
    mockFetch(
      mockResponse(
        {
          statusCode: 400,
          code: 'OTP_INVALID',
          message: 'Ma xac thuc khong dung',
          path: '/auth/verify-email',
          timestamp: new Date().toISOString(),
        },
        400,
      ),
    );
    const user = userEvent.setup();

    renderVerifyPage();
    await user.type(screen.getByLabelText('Mã xác thực'), '000000');
    await user.click(screen.getByRole('button', { name: 'Xác thực' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mã xác thực không đúng.');
  });

  it('shows an expired-code error', async () => {
    mockFetch(
      mockResponse(
        {
          statusCode: 400,
          code: 'OTP_EXPIRED',
          message: 'Ma xac thuc da het han',
          path: '/auth/verify-email',
          timestamp: new Date().toISOString(),
        },
        400,
      ),
    );
    const user = userEvent.setup();

    renderVerifyPage();
    await user.type(screen.getByLabelText('Mã xác thực'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mã xác thực đã hết hạn');
  });

  it('resends the code and disables the resend button during cooldown', async () => {
    mockFetch(mockResponse({ accepted: true }));
    const user = userEvent.setup();

    renderVerifyPage();
    await user.click(screen.getByRole('button', { name: 'Gửi lại mã' }));

    expect(await screen.findByRole('status')).toHaveTextContent('một mã mới đã được gửi');
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
  });
});
