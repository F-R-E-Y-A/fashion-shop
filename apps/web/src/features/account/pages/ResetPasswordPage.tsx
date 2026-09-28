import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { resetPassword } from '../api/index.js';

const OTP_ERROR_MESSAGES: Record<string, string> = {
  OTP_INVALID: 'Mã đặt lại mật khẩu không đúng.',
  OTP_EXPIRED: 'Mã đặt lại mật khẩu đã hết hạn. Hãy yêu cầu mã mới.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã nhập sai quá số lần cho phép. Hãy yêu cầu mã mới.',
};

export function ResetPasswordPage() {
  const location = useLocation() as { state?: { email?: string } };
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReset, setIsReset] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(email, code, newPassword);
      setIsReset(true);
    } catch (submitError) {
      const otpCode = submitError instanceof ApiError ? submitError.body.code : undefined;
      setError(
        (otpCode && OTP_ERROR_MESSAGES[otpCode]) ??
          'Không thể đặt lại mật khẩu. Hãy kiểm tra lại thông tin và thử lại.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isReset) {
    return (
      <section className="auth-page">
        <h1>Đặt lại mật khẩu</h1>
        <p role="status">Mật khẩu đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.</p>
        <button type="button" onClick={() => navigate('/login', { state: { email } })}>
          Đăng nhập ngay
        </button>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <h1>Đặt lại mật khẩu</h1>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Mã đặt lại mật khẩu
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
            required
          />
        </label>
        <label>
          Mật khẩu mới
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Xác nhận mật khẩu mới
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="auth-form__hint">Tối thiểu 8 ký tự, có một chữ hoa và một chữ số.</p>
        {error && (
          <p className="state state--error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting || code.length !== 6 || !email}>
          {isSubmitting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
        </button>
      </form>
      <p>
        Chưa có mã? <Link to="/quen-mat-khau">Yêu cầu mã mới</Link>
      </p>
    </section>
  );
}
