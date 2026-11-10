import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { useAuth } from '../AuthProvider.js';
import { SessionChangedError } from '../session-sync.js';

const ERROR_MESSAGES: Record<string, string> = {
  CURRENT_PASSWORD_INVALID: 'Mật khẩu hiện tại không đúng.',
  NEW_PASSWORD_SAME_AS_CURRENT: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
};

export function ChangePasswordPage() {
  const { isAuthenticated, isLoading, changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChanged, setIsChanged] = useState(false);

  // Trang chi danh cho nguoi da dang nhap: chua xong khoi phuc phien thi cho, xong roi ma van
  // khong dang nhap (va chua vua doi mat khau xong, vi doi mat khau thanh cong cung xoa phien)
  // thi day ve /login.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isChanged) navigate('/login');
  }, [isLoading, isAuthenticated, isChanged, navigate]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setIsChanged(true);
    } catch (submitError) {
      if (submitError instanceof SessionChangedError) {
        setError(submitError.message);
        return;
      }
      const code = submitError instanceof ApiError ? submitError.body.code : undefined;
      setError((code && ERROR_MESSAGES[code]) ?? 'Không thể đổi mật khẩu. Hãy thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChanged) {
    return (
      <section className="auth-page">
        <h1>Đổi mật khẩu</h1>
        <p role="status">Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.</p>
        <button type="button" onClick={() => navigate('/login')}>
          Đăng nhập ngay
        </button>
      </section>
    );
  }

  if (isLoading || !isAuthenticated) return null;

  return (
    <section className="auth-page">
      <h1>Đổi mật khẩu</h1>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          Mật khẩu hiện tại
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
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
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
      </form>
    </section>
  );
}
