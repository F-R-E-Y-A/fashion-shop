import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import {
  authErrorMessage,
  normalizeEmail,
  readAuthNavigation,
  validateConfirmation,
  validateEmail,
  validatePassword,
} from '../auth-form.js';
import { useAuth } from '../AuthProvider.js';
import {
  AuthField,
  AuthNotice,
  AuthSubmitButton,
  PasswordField,
  PasswordRequirements,
} from '../components/AuthForm.js';
import styles from '../components/AuthForm.module.css';
import { useAuthForm } from '../useAuthForm.js';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const context = readAuthNavigation(location.state);
  const form = useAuthForm(
    { email: context.email, password: '', confirmPassword: '' },
    (values) => ({
      email: validateEmail(values.email),
      password: validatePassword(values.password),
      confirmPassword: validateConfirmation(values.confirmPassword, values.password),
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setDuplicateEmail(false);
    if (!form.validateForSubmit(event.currentTarget)) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      const result = await register({
        email: normalizeEmail(form.values.email),
        password: form.values.password,
      });
      if (!active.current) return;
      form.resetField('password');
      form.resetField('confirmPassword');
      navigate('/xac-thuc-email', {
        state: { email: result.email, from: context.from, resendAvailableAt: Date.now() + 60_000 },
      });
    } catch (submitError) {
      if (!active.current) return;
      if (submitError instanceof ApiError && submitError.body.code === 'EMAIL_ALREADY_EXISTS') {
        form.setServerErrors({
          email: 'Không thể tạo tài khoản mới với email này. Hãy đăng nhập hoặc tiếp tục xác minh.',
        });
        setDuplicateEmail(true);
      } else {
        setError(
          authErrorMessage(submitError, 'Không thể đăng ký. Hãy kiểm tra thông tin và thử lại.'),
        );
      }
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <h1>Đăng ký</h1>
      <p className={styles.intro}>Tạo tài khoản, sau đó xác thực email để bắt đầu.</p>
      <form
        className={styles.form}
        noValidate
        onSubmit={onSubmit}
        aria-busy={isSubmitting}
        aria-label="Đăng ký tài khoản"
      >
        <AuthField
          id="register-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={isSubmitting}
          value={form.values.email}
          error={form.errors.email}
          onBlur={() => form.touch('email')}
          onChange={(event) => {
            form.setField('email', event.target.value);
            setDuplicateEmail(false);
            setError(null);
          }}
        />
        <PasswordField
          name="password"
          label="Mật khẩu"
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          value={form.values.password}
          error={form.errors.password}
          aria-describedby="register-password-requirements"
          onBlur={() => form.touch('password')}
          onChange={(event) => {
            form.setField('password', event.target.value);
            setError(null);
          }}
        />
        <PasswordRequirements id="register-password-requirements" password={form.values.password} />
        <PasswordField
          name="confirmPassword"
          label="Xác nhận mật khẩu"
          autoComplete="new-password"
          required
          disabled={isSubmitting}
          value={form.values.confirmPassword}
          error={form.errors.confirmPassword}
          onBlur={() => form.touch('confirmPassword')}
          onChange={(event) => {
            form.setField('confirmPassword', event.target.value);
            setError(null);
          }}
        />
        <AuthNotice message={error} />
        {duplicateEmail && (
          <p className={styles.navigation}>
            <Link
              to="/login"
              state={{ email: normalizeEmail(form.values.email), from: context.from }}
            >
              Đăng nhập
            </Link>
            {' hoặc '}
            <Link
              to="/xac-thuc-email"
              state={{ email: normalizeEmail(form.values.email), from: context.from }}
            >
              Tiếp tục xác minh email
            </Link>
            .
          </p>
        )}
        <AuthSubmitButton pending={isSubmitting} pendingLabel="Đang đăng ký…">
          Đăng ký
        </AuthSubmitButton>
      </form>
      <p className={styles.navigation}>
        Đã có tài khoản?{' '}
        <Link to="/login" state={{ email: normalizeEmail(form.values.email), from: context.from }}>
          Đăng nhập
        </Link>
      </p>
    </section>
  );
}
