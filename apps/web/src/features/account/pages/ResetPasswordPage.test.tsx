import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Location, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPasswordPage } from './ResetPasswordPage.js';

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

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/dat-lai-mat-khau', state }]}>
      <Routes>
        <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
        <Route path="/login" element={<p>Trang đăng nhập</p>} />
        <Route path="/quen-mat-khau" element={<p>Trang quên mật khẩu</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ResetPasswordPage 3-step UI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders Step 2 (OTP) with email from location state and accepts OTP', async () => {
    mockFetch(mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }));
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com', fromForgot: true });

    expect(
      screen.getByText('Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.'),
    ).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();

    const otpInput = screen.getByLabelText('Mã đặt lại mật khẩu');
    await user.type(otpInput, '123456');

    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));

    // Should transition to Step 3
    expect(await screen.findByLabelText('Mật khẩu mới')).toBeInTheDocument();
    expect(screen.getByLabelText('Xác nhận mật khẩu mới')).toBeInTheDocument();
  });

  it('toggles password visibility in Step 3', async () => {
    mockFetch(mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }));
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com' });

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));

    const passwordInput = await screen.findByLabelText('Mật khẩu mới');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: 'Hiện mật khẩu mới' });
    await user.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu mới' })).toBeInTheDocument();
  });

  it('handles resend OTP and displays cooldown', async () => {
    mockFetch(mockResponse({ accepted: true }));
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com' });

    const resendButton = screen.getByRole('button', { name: 'Gửi lại mã' });
    await user.click(resendButton);

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' }),
    );

    expect(screen.getByRole('button', { name: /Gửi lại sau/ })).toBeDisabled();
  });

  it('allows changing email in Step 2', async () => {
    const user = userEvent.setup();

    renderPage({ email: 'initial@example.com' });

    const editEmailButton = screen.getByRole('button', { name: 'Đổi email' });
    await user.click(editEmailButton);

    const emailInput = screen.getByLabelText('Email');
    expect(emailInput).toHaveValue('initial@example.com');

    await user.clear(emailInput);
    await user.type(emailInput, 'new-email@example.com');
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    expect(screen.getByText('new-email@example.com')).toBeInTheDocument();
  });

  it('shows error when RESET_GRANT_STALE is returned and transitions back to OTP step', async () => {
    mockFetch(
      mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }),
      mockResponse(
        {
          statusCode: 400,
          code: 'RESET_GRANT_STALE',
          message: 'Trang thai tai khoan hoac mat khau da thay doi',
          path: '/auth/reset-password',
          timestamp: new Date().toISOString(),
        },
        400,
      ),
    );
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com' });

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));

    await user.type(screen.getByLabelText('Mật khẩu mới'), 'Password123');
    await user.type(screen.getByLabelText('Xác nhận mật khẩu mới'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(
      await screen.findByText(
        'Trạng thái tài khoản hoặc mật khẩu đã thay đổi. Vui lòng yêu cầu mã mới.',
      ),
    ).toBeInTheDocument();

    // Verify it returned to Step 2
    expect(screen.getByLabelText('Mã đặt lại mật khẩu')).toBeInTheDocument();
  });

  it('shows lost-grant recovery screen and requests a new code after reload with preserved history state', async () => {
    mockFetch(
      mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }),
      mockResponse({ accepted: true }),
    );
    const user = userEvent.setup();
    let latestLocation: Location = {
      pathname: '/dat-lai-mat-khau',
      search: '',
      hash: '',
      state: { email: 'user@example.com', fromForgot: true },
      key: 'initial',
    };

    function LocationTracker() {
      latestLocation = useLocation();
      return null;
    }

    const { unmount } = render(
      <MemoryRouter initialEntries={[latestLocation]}>
        <LocationTracker />
        <Routes>
          <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
          <Route path="/quen-mat-khau" element={<p>Trang quên mật khẩu</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument();

    // Simulate browser reload (F5): React memory is wiped, history.state is preserved
    unmount();
    render(
      <MemoryRouter initialEntries={[latestLocation]}>
        <Routes>
          <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
          <Route path="/quen-mat-khau" element={<p>Trang quên mật khẩu</p>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Phiên làm việc đã hết hạn hoặc trang đã được tải lại. Vui lòng yêu cầu mã mới.',
    );
    expect(screen.queryByLabelText('Mã đặt lại mật khẩu')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yêu cầu mã mới' }));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByLabelText('Mã đặt lại mật khẩu')).toBeInTheDocument();
  });

  it('ignores late OTP verification response after user changes email in Step 2', async () => {
    let resolveVerifyA!: (value: Response) => void;
    const deferredVerifyA = new Promise<Response>((resolve) => {
      resolveVerifyA = resolve;
    });

    vi.mocked(fetch).mockImplementation(async () => deferredVerifyA);
    const user = userEvent.setup();

    renderPage({ email: 'a@example.com', fromForgot: true });

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));

    // While verify for A is in-flight, user changes email to B
    await user.click(screen.getByRole('button', { name: 'Đổi email' }));
    const emailInput = screen.getByLabelText('Email');
    await user.clear(emailInput);
    await user.type(emailInput, 'b@example.com');
    await user.click(screen.getByRole('button', { name: 'Xong' }));

    // Late response for email A arrives
    await act(async () => {
      resolveVerifyA(mockResponse({ resetToken: 'grant-for-a-12345678901234567890123456789012' }));
      await Promise.resolve();
    });

    // UI must stay on Step 2 for email B and never enter Step 3 with A's grant
    expect(screen.getByText('b@example.com')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã đặt lại mật khẩu')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping resend while OTP verification is in-flight', async () => {
    let resolveVerify!: (value: Response) => void;
    const deferredVerify = new Promise<Response>((resolve) => {
      resolveVerify = resolve;
    });

    vi.mocked(fetch).mockImplementationOnce(async () => deferredVerify);
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com', fromForgot: true });

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Xác thực mã' }));

    const resendButton = screen.getByRole('button', { name: 'Gửi lại mã' });
    expect(resendButton).toBeDisabled();
    await user.click(resendButton);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveVerify(
        mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }),
      );
      await Promise.resolve();
    });

    expect(await screen.findByLabelText('Mật khẩu mới')).toBeInTheDocument();
  });

  it('prevents overlapping verify while resend is in-flight and re-enables verify afterwards', async () => {
    let resolveResend!: (value: Response) => void;
    const deferredResend = new Promise<Response>((resolve) => {
      resolveResend = resolve;
    });

    vi.mocked(fetch)
      .mockImplementationOnce(async () => deferredResend)
      .mockImplementationOnce(async () =>
        mockResponse({ resetToken: 'mock-grant-token-12345678901234567890123456789012' }),
      );
    const user = userEvent.setup();

    renderPage({ email: 'user@example.com', fromForgot: true });

    await user.type(screen.getByLabelText('Mã đặt lại mật khẩu'), '123456');
    await user.click(screen.getByRole('button', { name: 'Gửi lại mã' }));

    const verifyButton = screen.getByRole('button', { name: 'Xác thực mã' });
    expect(verifyButton).toBeDisabled();
    await user.click(verifyButton);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveResend(mockResponse({ accepted: true }));
      await Promise.resolve();
    });

    expect(verifyButton).toBeEnabled();
    await user.click(verifyButton);
    expect(await screen.findByLabelText('Mật khẩu mới')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
