import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StoreLayout } from '@/app/StoreLayout';

vi.mock('@/features/products', () => ({
  CategoryMenu: () => <nav data-testid="mock-category-menu" />,
}));

import { AuthProvider, useAuth } from './AuthProvider.js';
import { ChangePasswordPage } from './pages/ChangePasswordPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
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

/** Neither password-recovery page uses AuthProvider: they only call the OTP endpoints directly. */
function renderForgotPasswordPage() {
  return render(
    <MemoryRouter initialEntries={['/quen-mat-khau']}>
      <Routes>
        <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
        <Route path="/dat-lai-mat-khau" element={<p>Trang đặt lại mật khẩu</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderResetPasswordPage(initialEmail = 'customer@example.com') {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/dat-lai-mat-khau', state: { email: initialEmail } }]}
    >
      <Routes>
        <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Trang đăng nhập</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Unlike the OTP pages, ChangePasswordPage needs AuthProvider; StoreLayout shows the auth state. */
function renderChangePasswordPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/doi-mat-khau']}>
        <Routes>
          <Route element={<StoreLayout />}>
            <Route path="/doi-mat-khau" element={<ChangePasswordPage />} />
            <Route path="/login" element={<p>Trang đăng nhập</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillChangePasswordForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { current: string; next: string; confirm: string },
) {
  await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), values.current);
  await user.type(screen.getByLabelText('Mật khẩu mới'), values.next);
  await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), values.confirm);
  await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
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

  it('shows a forgot-password link on the login page', async () => {
    mockFetch(mockResponse({}, 401));

    renderWithRoutes('/login');

    expect(await screen.findByRole('link', { name: 'Quên mật khẩu?' })).toHaveAttribute(
      'href',
      '/quen-mat-khau',
    );
  });

  it('shows the generic message when the backend accepts the request for an eligible account', async () => {
    mockFetch(mockResponse({ accepted: true }));
    const user = userEvent.setup();

    renderForgotPasswordPage();
    await user.type(screen.getByLabelText('Email'), 'customer@example.com');
    await user.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.',
    );
    await user.click(screen.getByRole('button', { name: 'Tôi đã có mã' }));
    expect(await screen.findByText('Trang đặt lại mật khẩu')).toBeInTheDocument();
  });

  it('shows the exact same generic message for an unknown email (indistinguishable from an eligible one)', async () => {
    // The API always answers 200 { accepted: true } for an unknown/ineligible email too, so this
    // is the same response shape as the "eligible" test above — the UI has no way to tell them
    // apart, which is the point: it renders the identical status message either way.
    mockFetch(mockResponse({ accepted: true }));
    const user = userEvent.setup();

    renderForgotPasswordPage();
    await user.type(screen.getByLabelText('Email'), 'never-registered@example.com');
    await user.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.',
    );
  });

  it('shows a retry error, not the generic success message, when the request fails', async () => {
    mockFetch(mockResponse({}, 500));
    const user = userEvent.setup();

    renderForgotPasswordPage();
    await user.type(screen.getByLabelText('Email'), 'customer@example.com');
    await user.click(screen.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('rejects a mismatched password confirmation without calling the API', async () => {
    const user = userEvent.setup();

    renderResetPasswordPage();
    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'DifferentPassword123');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resets the password and shows a success state with a login CTA', async () => {
    mockFetch(mockResponse({ reset: true }));
    const user = userEvent.setup();

    renderResetPasswordPage();
    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassword123');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Mật khẩu đã được đặt lại');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }));
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
  });

  it('shows an OTP-expired error on reset-password without leaving the form', async () => {
    mockFetch(
      mockResponse(
        {
          statusCode: 400,
          code: 'OTP_EXPIRED',
          message: 'Ma xac thuc da het han',
          path: '/auth/reset-password',
          timestamp: new Date().toISOString(),
        },
        400,
      ),
    );
    const user = userEvent.setup();

    renderResetPasswordPage();
    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'NewPassword123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'NewPassword123');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mã đặt lại mật khẩu đã hết hạn');
  });

  describe('change password', () => {
    it('redirects an unauthenticated visitor to the login page instead of showing the form', async () => {
      mockFetch(mockResponse({}, 401));

      renderChangePasswordPage();

      expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
      expect(screen.queryByLabelText('Mật khẩu hiện tại')).not.toBeInTheDocument();
    });

    it('shows the form and a navbar link to it for an authenticated user', async () => {
      mockFetch(mockResponse(authenticated));

      renderChangePasswordPage();

      expect(await screen.findByLabelText('Mật khẩu hiện tại')).toBeInTheDocument();
      expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument();
      expect(screen.getByLabelText('Xác nhận mật khẩu mới')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Đổi mật khẩu' })).toHaveAttribute(
        'href',
        '/doi-mat-khau',
      );
    });

    it('rejects a mismatched confirmation without calling the API', async () => {
      mockFetch(mockResponse(authenticated));
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'NewPassword123',
        confirm: 'DifferentPassword123',
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu xác nhận không khớp.');
      expect(fetch).toHaveBeenCalledTimes(1); // only the session-restore call at mount
    });

    it('rejects a new password equal to the current one without calling the API', async () => {
      mockFetch(mockResponse(authenticated));
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'Password123',
        confirm: 'Password123',
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Mật khẩu mới phải khác mật khẩu hiện tại.',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('shows a wrong-current-password error, stays signed in, and does not refresh-retry', async () => {
      mockFetch(
        mockResponse(authenticated),
        mockResponse(
          {
            statusCode: 400,
            code: 'CURRENT_PASSWORD_INVALID',
            message: 'Mat khau hien tai khong dung',
            path: '/auth/change-password',
            timestamp: new Date().toISOString(),
          },
          400,
        ),
      );
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'WrongPassword123',
        next: 'NewPassword123',
        confirm: 'NewPassword123',
      });

      expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu hiện tại không đúng.');
      expect(screen.getByText('customer@example.com')).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(2); // restore + change-password, no /auth/refresh retry
    });

    it('shows a server error message without leaking backend details and stays signed in', async () => {
      mockFetch(
        mockResponse(authenticated),
        mockResponse({ statusCode: 500, code: 'INTERNAL_SERVER_ERROR', message: 'boom' }, 500),
      );
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'NewPassword123',
        confirm: 'NewPassword123',
      });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Không thể đổi mật khẩu. Hãy thử lại.');
      expect(alert).not.toHaveTextContent('boom');
      expect(screen.getByText('customer@example.com')).toBeInTheDocument();
    });

    it('sends only the two passwords, clears the auth state on success, and offers a login CTA', async () => {
      mockFetch(mockResponse(authenticated), mockResponse(undefined, 204));
      const user = userEvent.setup();

      renderChangePasswordPage();
      await screen.findByText('customer@example.com');
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'NewPassword123',
        confirm: 'NewPassword123',
      });

      expect(await screen.findByRole('status')).toHaveTextContent(
        'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.',
      );

      const [, changeCall] = vi.mocked(fetch).mock.calls;
      expect(String(changeCall?.[0])).toContain('/auth/change-password');
      expect(JSON.parse(String(changeCall?.[1]?.body))).toEqual({
        currentPassword: 'Password123',
        newPassword: 'NewPassword123',
      });

      // Auth state is gone: the navbar is back to the guest links and the success view stayed put
      // (it was not bounced to /login by the "unauthenticated" redirect).
      expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
      expect(screen.queryByText('customer@example.com')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }));
      expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
    });

    it('sends the user to the login page when the session expired and cannot be refreshed', async () => {
      mockFetch(
        mockResponse(authenticated),
        mockResponse(unauthorized, 401), // change-password rejected by AuthGuard
        mockResponse(unauthorized, 401), // the one refresh attempt also fails
      );
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'NewPassword123',
        confirm: 'NewPassword123',
      });

      expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('does not keep passwords in web storage or the URL', async () => {
      mockFetch(mockResponse(authenticated), mockResponse(undefined, 204));
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      const user = userEvent.setup();

      renderChangePasswordPage();
      await fillChangePasswordForm(user, {
        current: 'Password123',
        next: 'NewPassword123',
        confirm: 'NewPassword123',
      });
      await screen.findByRole('status');

      expect(setItem).not.toHaveBeenCalled();
      expect(window.location.href).not.toContain('Password123');
      setItem.mockRestore();
    });
  });
});
