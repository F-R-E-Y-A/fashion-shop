import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/features/account';

import { AppRoutes } from './routes.js';

// Giữ nguyên cây routing/AuthLayout; các feature ngoài phạm vi không gọi API thật.
vi.mock('@/features/products', () => ({
  CategoryMenu: () => <nav aria-label="Danh mục" />,
  SearchTrigger: () => <button>Tìm kiếm</button>,
  HomePage: () => <p>Trang chủ</p>,
  CategoryPage: () => null,
  SearchPage: () => null,
  ProductListPage: () => null,
  ProductDetailPage: () => null,
  AdminCatalogPage: () => null,
  AdminCatalogDetailPage: () => null,
  AdminCategoriesPage: () => null,
  AdminCategoryNewPage: () => null,
  AdminCategoryDetailPage: () => null,
  AdminProductsPage: () => null,
}));
vi.mock('@/features/cart', () => ({
  cartKeys: { all: ['cart'], current: () => ['cart', 'current'] },
  getCart: async () => ({ items: [], itemCount: 0 }),
  mergeCart: async () => null,
  CartPage: () => <p>Trang giỏ hàng</p>,
}));

const request = vi.fn<(path: string, options?: RequestInit) => Promise<Response>>();
function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
function apiError(code: string, status = 400) {
  return response(
    { statusCode: status, code, message: 'raw internal detail', path: '/auth', timestamp: '' },
    status,
  );
}
function renderFlow(path: string, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
function fillRegister(password = 'Password123', confirmation = password) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Customer@Example.com' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), { target: { value: confirmation } });
}
function submitRegister() {
  fireEvent.submit(screen.getByRole('form', { name: 'Đăng ký tài khoản' }));
}
function fillOtp(code = '012345') {
  fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: code } });
}
function submitVerify() {
  fireEvent.submit(screen.getByRole('form', { name: 'Xác thực email' }));
}

beforeEach(() => {
  request.mockReset();
  localStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/auth/refresh')) return apiError('UNAUTHORIZED', 401);
      return request(path, options);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Mã UC cho OTP chưa được chuẩn hóa trong index; không tự gán mã mới.
describe('PH-03 — Register + Verify Email trên AppRoutes', () => {
  it('opens without errors and separates registration from OTP', () => {
    renderFlow('/register');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute(
      'aria-describedby',
      'register-password-requirements',
    );
    expect(screen.queryByLabelText('Mã xác thực')).not.toBeInTheDocument();
    expect(screen.getByText('Tối thiểu 8 ký tự')).toBeInTheDocument();
    expect(screen.getByText('Có ít nhất một chữ hoa A–Z')).toBeInTheDocument();
    expect(screen.getByText('Có ít nhất một số 0–9')).toBeInTheDocument();
  });

  it('shows separate required errors and focuses the first invalid field', () => {
    renderFlow('/register');
    submitRegister();
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập mật khẩu.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng xác nhận mật khẩu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Vui lòng nhập email.');
    expect(request).not.toHaveBeenCalled();
  });

  it('validates on blur and clears feedback as the field is corrected', () => {
    renderFlow('/register');
    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'invalid' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.blur(email);
    expect(screen.getByText('Email chưa đúng định dạng.')).toBeInTheDocument();
    fireEvent.change(email, { target: { value: 'customer@example.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['short', 'lowercase123', 'UppercaseOnly'])(
    'rejects the current policy violation %s locally',
    (password) => {
      renderFlow('/register');
      fillRegister(password);
      submitRegister();
      expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(/Mật khẩu cần tối thiểu 8 ký tự/)).toBeInTheDocument();
      expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('requires confirmation independently of a valid password', () => {
    renderFlow('/register');
    fillRegister('Password123', '');
    submitRegister();
    expect(screen.getByText('Vui lòng xác nhận mật khẩu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('aria-invalid', 'false');
    expect(request).not.toHaveBeenCalled();
  });

  it('revalidates confirmation after either password changes', () => {
    renderFlow('/register');
    fillRegister('Password123', 'Different123');
    submitRegister();
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'Password123' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Changed123' } });
    expect(screen.getByText('Mật khẩu xác nhận không khớp.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('toggles each password without submitting or losing its value', async () => {
    const user = userEvent.setup();
    renderFlow('/register');
    fillRegister();
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('Password123');
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password');
    expect(request).not.toHaveBeenCalled();
  });

  it('accepts the existing 8-character policy, sends only credentials and starts verification cooldown', async () => {
    request.mockResolvedValue(
      response({ verificationRequired: true, email: 'normalized@example.com' }, 201),
    );
    renderFlow('/register', { from: '/gio-hang' });
    fillRegister('Abcdefg1');
    submitRegister();
    await screen.findByRole('heading', { name: 'Xác thực email' });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'customer@example.com',
      password: 'Abcdefg1',
    });
    expect(screen.getByLabelText('Email')).toHaveValue('normalized@example.com');
    expect(screen.queryByLabelText('Mật khẩu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('prevents duplicate submissions even when submit events bypass a disabled button', async () => {
    let finish!: (value: Response) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderFlow('/register');
    fillRegister();
    submitRegister();
    submitRegister();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Đang đăng ký…' })).toBeDisabled();
    await act(async () =>
      finish(response({ verificationRequired: true, email: 'customer@example.com' }, 201)),
    );
    expect(screen.getByRole('heading', { name: 'Xác thực email' })).toBeInTheDocument();
  });

  it('keeps input and offers continuation for duplicate email without interpreting pending status', async () => {
    request.mockResolvedValue(apiError('EMAIL_ALREADY_EXISTS', 409));
    renderFlow('/register');
    fillRegister();
    submitRegister();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không thể tạo tài khoản mới với email này',
    );
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('Password123');
    expect(screen.getByLabelText('Xác nhận mật khẩu')).toHaveValue('Password123');
    expect(screen.getByRole('link', { name: 'Tiếp tục xác minh email' })).toBeInTheDocument();
    expect(screen.queryByText('raw internal detail')).not.toBeInTheDocument();
  });

  it.each([
    ['BAD_REQUEST', 400, 'Không thể đăng ký.'],
    ['RATE_LIMITED', 429, 'Bạn đã gửi quá nhiều yêu cầu.'],
    ['SERVICE_UNAVAILABLE', 503, 'Dịch vụ tạm thời chưa khả dụng.'],
  ])('maps register %s safely and retains entered values', async (code, status, message) => {
    request.mockResolvedValue(apiError(code, status));
    renderFlow('/register');
    fillRegister();
    submitRegister();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText('raw internal detail')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('Password123');
    expect(screen.getByRole('button', { name: 'Đăng ký' })).toBeEnabled();
  });

  it('maps network failure independently from password errors', async () => {
    request.mockRejectedValue(new TypeError('private network detail'));
    renderFlow('/register');
    fillRegister();
    submitRegister();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối.');
    expect(screen.queryByText('private network detail')).not.toBeInTheDocument();
  });

  it('requires valid email before resend and reports empty OTP on verification', () => {
    renderFlow('/xac-thuc-email');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(screen.getByText('Vui lòng nhập email.')).toBeInTheDocument();
    expect(screen.queryByText('Vui lòng nhập mã xác thực.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(screen.getByText('Email chưa đúng định dạng.')).toBeInTheDocument();
    submitVerify();
    expect(screen.getByText('Vui lòng nhập mã xác thực.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('supports OTP paste/autofill, leading zeros and normalized payload', async () => {
    const user = userEvent.setup();
    request.mockResolvedValue(response({ verified: true }));
    renderFlow('/xac-thuc-email', { email: 'Customer@Example.com' });
    const otp = screen.getByLabelText('Mã xác thực');
    expect(otp).toHaveAttribute('inputmode', 'numeric');
    expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
    await user.click(otp);
    await user.paste('012 345');
    expect(otp).toHaveValue('012345');
    submitVerify();
    expect(await screen.findByRole('status')).toHaveTextContent('đã được xác thực');
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      email: 'customer@example.com',
      code: '012345',
    });
  });

  it.each([
    ['OTP_INVALID', 'Mã xác thực không đúng.'],
    ['OTP_EXPIRED', 'Mã xác thực đã hết hạn.'],
    ['OTP_ATTEMPTS_EXCEEDED', 'Bạn đã nhập sai quá số lần cho phép.'],
  ])('maps %s below OTP and clears it when email context changes', async (code, message) => {
    request.mockResolvedValue(apiError(code));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    submitVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Mã xác thực')).toHaveFocus();
    expect(screen.getByLabelText('Mã xác thực')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.com' } });
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('prevents duplicate verification and concurrent resend', async () => {
    let finish!: (value: Response) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    submitVerify();
    submitVerify();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Email')).toBeDisabled();
    await act(async () => finish(response({ verified: true })));
    expect(screen.getByRole('status')).toHaveTextContent('đã được xác thực');
  });

  it('shows resend loading, generic accepted text and a cooldown bound to email', async () => {
    let finish!: (value: Response) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(screen.getByRole('button', { name: 'Đang gửi yêu cầu…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xác thực' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Đang gửi yêu cầu…' }));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => finish(response({ accepted: true })));
    expect(screen.getByRole('status')).toHaveTextContent('Nếu email đủ điều kiện');
    expect(screen.getByRole('status')).not.toHaveTextContent('đã được gửi');
    expect(screen.getByRole('status')).toHaveTextContent('Nếu nhận được mã mới');
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('012345');
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@example.com' } });
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'customer@example.com' } });
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
  });

  it('re-enables resend after 60 seconds without claiming delivery', async () => {
    vi.useFakeTimers();
    request.mockResolvedValue(response({ accepted: true }));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' })));
    expect(screen.getByRole('button', { name: 'Gửi lại sau 60s' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['RATE_LIMITED', 429, 'quá nhiều yêu cầu'],
    ['SERVICE_UNAVAILABLE', 503, 'tạm thời chưa khả dụng'],
  ])('allows retry after resend %s without success text', async (code, status, message) => {
    request.mockResolvedValue(apiError(code, status));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
  });

  it('preserves normalized email and safe return location through Login → Register → Verify → Login', async () => {
    request.mockImplementation(async (path) => {
      if (path.endsWith('/register'))
        return response({ verificationRequired: true, email: 'canonical@example.com' }, 201);
      if (path.endsWith('/verify-email')) return response({ verified: true });
      if (path.endsWith('/login'))
        return response({
          accessToken: 'test-token',
          user: { id: 'test-user', email: 'canonical@example.com', roles: ['CUSTOMER'] },
        });
      throw new Error('Unexpected auth request');
    });
    renderFlow('/login', { from: '/gio-hang' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Customer@Example.com' } });
    fireEvent.click(screen.getByRole('link', { name: 'Đăng ký' }));
    expect(screen.getByLabelText('Email')).toHaveValue('customer@example.com');
    fillRegister();
    submitRegister();
    await screen.findByRole('heading', { name: 'Xác thực email' });
    fillOtp();
    submitVerify();
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }));
    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('canonical@example.com');
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Đăng nhập' }).closest('form')!);
    await screen.findByText('Trang giỏ hàng');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    expect(request.mock.calls.map(([path]) => path.split('/').pop())).toEqual([
      'register',
      'verify-email',
      'login',
    ]);
  });

  it('does not steal focus while correcting another field after a duplicate-email error', async () => {
    const user = userEvent.setup();
    request.mockResolvedValue(apiError('EMAIL_ALREADY_EXISTS', 409));
    renderFlow('/register');
    fillRegister();
    submitRegister();
    await screen.findByRole('alert');
    await user.click(screen.getByLabelText('Mật khẩu'));
    await user.type(screen.getByLabelText('Mật khẩu'), '4');
    expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('Password1234');
  });

  it('does not navigate on a late registration response after the user leaves the form', async () => {
    let finish!: (value: Response) => void;
    request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderFlow('/register');
    fillRegister();
    submitRegister();
    fireEvent.click(screen.getByRole('link', { name: 'Đăng nhập' }));
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    await act(async () =>
      finish(response({ verificationRequired: true, email: 'customer@example.com' }, 201)),
    );
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Xác thực email' })).not.toBeInTheDocument();
  });

  it('supports keyboard password visibility toggle with a connected control', async () => {
    const user = userEvent.setup();
    renderFlow('/register');
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    // Hai brand links của AuthLayout, email, rồi password.
    expect(screen.getByLabelText('Mật khẩu')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'text');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a partial OTP and treats unknown error codes safely', async () => {
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp('012');
    submitVerify();
    expect(screen.getByText('Nhập mã gồm 6 chữ số.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(apiError('toString'));
    fillOtp();
    submitVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác thực.');
    expect(screen.queryByText('raw internal detail')).not.toBeInTheDocument();
  });

  it('shows a safe retry message on resend network failure', async () => {
    request.mockRejectedValue(new TypeError('private network detail'));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối.');
    expect(screen.getByRole('button', { name: 'Gửi lại mã' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('012345');
  });

  it.each(['a..b@example.com', 'a,b@example.com', 'a@-example.com', 'a@example'])(
    'shows malformed email %s at the field without calling register',
    (email) => {
      renderFlow('/register');
      fillRegister();
      fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
      submitRegister();
      expect(screen.getByLabelText('Email')).toHaveFocus();
      expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
        'Email chưa đúng định dạng.',
      );
      expect(screen.getByLabelText('Mật khẩu')).toHaveValue('Password123');
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('keeps the entered code after accepted resend and clears the old OTP error', async () => {
    request
      .mockResolvedValueOnce(apiError('OTP_INVALID'))
      .mockResolvedValueOnce(response({ accepted: true }));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    submitVerify();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại mã' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nếu nhận được mã mới');
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('012345');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gửi lại sau \d+s/ })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['RATE_LIMITED', 429, 'quá nhiều yêu cầu'],
    ['SERVICE_UNAVAILABLE', 503, 'tạm thời chưa khả dụng'],
  ])('retains OTP and allows retry after verification %s', async (code, status, message) => {
    request.mockResolvedValue(apiError(code, status));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    submitVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('012345');
    expect(screen.getByRole('button', { name: 'Xác thực' })).toBeEnabled();
    expect(screen.queryByText('raw internal detail')).not.toBeInTheDocument();
  });

  it('retains OTP and allows retry after verification network failure', async () => {
    request.mockRejectedValue(new TypeError('private network detail'));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com' });
    fillOtp();
    submitVerify();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể kết nối.');
    expect(screen.getByLabelText('Mã xác thực')).toHaveValue('012345');
    expect(screen.getByRole('button', { name: 'Xác thực' })).toBeEnabled();
    expect(screen.queryByText('private network detail')).not.toBeInTheDocument();
  });

  it.each(['/LOGIN', '/Register', '/login//', '/xac-thuc-email//', '/%52egister/?x=1#form'])(
    'returns to home after login instead of returning to auth route %s',
    async (from) => {
      request.mockResolvedValue(
        response({
          accessToken: 'test-token',
          user: { id: 'test-user', email: 'customer@example.com', roles: ['CUSTOMER'] },
        }),
      );
      renderFlow('/login', { email: 'customer@example.com', from });
      fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123' } });
      fireEvent.submit(screen.getByRole('button', { name: 'Đăng nhập' }).closest('form')!);
      expect(await screen.findByText('Trang chủ')).toBeInTheDocument();
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('discards external return context when verification links to Login', async () => {
    request.mockResolvedValue(response({ verified: true }));
    renderFlow('/xac-thuc-email', { email: 'customer@example.com', from: '//evil.example' });
    fillOtp();
    submitVerify();
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập ngay' }));
    request.mockResolvedValue(
      response({
        accessToken: 'test-token',
        user: { id: 'test-user', email: 'customer@example.com', roles: ['CUSTOMER'] },
      }),
    );
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password123' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Đăng nhập' }).closest('form')!);
    expect(await screen.findByText('Trang chủ')).toBeInTheDocument();
  });
});
