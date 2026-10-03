import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { useAuth } from '../AuthProvider.js';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUnverifiedEmail(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(
        typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/',
      );
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.body.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email);
      } else {
        setError('Email hoặc mật khẩu không đúng.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <h1>Đăng nhập</h1>
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
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="state state--error" role="alert">
            {error}
          </p>
        )}
        {unverifiedEmail && (
          <p className="state state--error" role="alert">
            Email chưa được xác thực.{' '}
            <Link to="/xac-thuc-email" state={{ email: unverifiedEmail }}>
              Xác thực ngay
            </Link>
          </p>
        )}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <p>
        <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
      </p>
      <p>
        Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </section>
  );
}
