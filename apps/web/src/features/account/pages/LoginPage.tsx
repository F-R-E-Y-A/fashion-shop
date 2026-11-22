import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { readAuthNavigation } from '../auth-form.js';
import { useAuth } from '../AuthProvider.js';
import { AuthField, AuthNotice, AuthSubmitButton, PasswordField } from '../components/AuthForm.js';
import styles from '../components/AuthForm.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const context = readAuthNavigation(location.state);
  const [email, setEmail] = useState(context.email);
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
      navigate(context.from ?? '/');
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
    <section className={styles.page}>
      <h1>Đăng nhập</h1>
      <p className={styles.intro}>Đăng nhập bằng email và mật khẩu để tiếp tục.</p>
      <form className={styles.form} onSubmit={onSubmit} aria-busy={isSubmitting}>
        <AuthField
          id="login-email"
          name="email"
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          disabled={isSubmitting}
          required
        />
        <PasswordField
          id="login-password"
          name="password"
          label="Mật khẩu"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          disabled={isSubmitting}
          required
        />
        <AuthNotice message={error} />
        {unverifiedEmail && (
          <AuthNotice message="Email chưa được xác thực.">
            <Link to="/xac-thuc-email" state={{ email: unverifiedEmail, from: context.from }}>
              Xác thực ngay
            </Link>
          </AuthNotice>
        )}
        <AuthSubmitButton pending={isSubmitting} pendingLabel="Đang đăng nhập…">
          Đăng nhập
        </AuthSubmitButton>
      </form>
      <p className={styles.navigation}>
        <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
      </p>
      <p className={styles.navigation}>
        Chưa có tài khoản?{' '}
        <Link to="/register" state={{ email, from: context.from }}>
          Đăng ký
        </Link>
      </p>
    </section>
  );
}
