import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { forgotPassword, resetPassword, verifyPasswordResetOtp } from '../api/index.js';
import { OTP_ERROR_MESSAGES, passwordRequirements, validatePassword } from '../auth-form.js';

interface ResetPasswordLocationState {
  email?: string;
  fromForgot?: boolean;
  resendAvailableAt?: number;
  step?: 'otp' | 'password';
}

export function ResetPasswordPage() {
  const location = useLocation() as { pathname: string; state?: ResetPasswordLocationState };
  const navigate = useNavigate();

  const [email, setEmail] = useState(location.state?.email ?? '');
  const [isEditingEmail, setIsEditingEmail] = useState(!location.state?.email);
  const [step, setStep] = useState<'otp' | 'password'>(() =>
    location.state?.step === 'password' ? 'password' : 'otp',
  );
  const requestGenRef = useRef(0);
  const activeEmailRef = useRef((location.state?.email ?? '').trim().toLowerCase());

  // Step 2 (OTP) state
  const [code, setCode] = useState('');
  const [resendDeadline, setResendDeadline] = useState(location.state?.resendAvailableAt ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [isResending, setIsResending] = useState(false);

  // Step 3 (New password) state - resetToken is held ONLY in React state memory
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Common UI state
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    location.state?.fromForgot
      ? 'Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.'
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReset, setIsReset] = useState(false);

  // Resend cooldown timer
  useEffect(() => {
    if (!resendDeadline) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendDeadline) window.clearInterval(interval);
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [resendDeadline]);

  const remainingSeconds = Math.max(0, Math.ceil((resendDeadline - now) / 1_000));

  function syncLocationStep(nextStep: 'otp' | 'password', nextEmail?: string) {
    navigate(location.pathname, {
      replace: true,
      state: {
        ...location.state,
        email: nextEmail ?? email.trim().toLowerCase(),
        step: nextStep,
      },
    });
  }

  function handleEmailChange(nextEmail: string) {
    requestGenRef.current += 1;
    const normalized = nextEmail.trim().toLowerCase();
    activeEmailRef.current = normalized;
    setEmail(nextEmail);
    setResetToken(null);
    setCode('');
    setError(null);
    setStatusMessage(null);
    setIsSubmitting(false);
    setIsResending(false);
    setResendDeadline(0);
    if (step !== 'otp') {
      setStep('otp');
      syncLocationStep('otp', normalized);
    }
  }

  async function onResend() {
    const trimmedEmail = email.trim().toLowerCase();
    if (isResending || isSubmitting || remainingSeconds > 0 || !trimmedEmail) return;
    const gen = requestGenRef.current;
    activeEmailRef.current = trimmedEmail;
    setError(null);
    setIsResending(true);
    try {
      await forgotPassword(trimmedEmail);
      if (requestGenRef.current !== gen || activeEmailRef.current !== trimmedEmail) return;
      const deadline = Date.now() + 60_000;
      setResendDeadline(deadline);
      setNow(Date.now());
      setStatusMessage('Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.');
    } catch {
      if (requestGenRef.current !== gen || activeEmailRef.current !== trimmedEmail) return;
      setError('Không thể gửi lại mã lúc này. Vui lòng thử lại sau.');
    } finally {
      if (requestGenRef.current === gen && activeEmailRef.current === trimmedEmail) {
        setIsResending(false);
      }
    }
  }

  async function onVerifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isResending) return;
    setError(null);
    setStatusMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Vui lòng nhập email.');
      return;
    }
    if (code.length !== 6) {
      setError('Mã xác thực gồm 6 chữ số.');
      return;
    }

    const gen = requestGenRef.current;
    activeEmailRef.current = trimmedEmail;
    setIsSubmitting(true);
    try {
      const response = await verifyPasswordResetOtp(trimmedEmail, code);
      if (requestGenRef.current !== gen || activeEmailRef.current !== trimmedEmail) return;
      setResetToken(response.resetToken);
      setCode('');
      setStep('password');
      syncLocationStep('password', trimmedEmail);
    } catch (submitError) {
      if (requestGenRef.current !== gen || activeEmailRef.current !== trimmedEmail) return;
      const errCode = submitError instanceof ApiError ? submitError.body.code : undefined;
      setError(
        (errCode && OTP_ERROR_MESSAGES[errCode]) ??
          'Mã xác thực không đúng. Hãy kiểm tra lại email và mã.',
      );
    } finally {
      if (requestGenRef.current === gen && activeEmailRef.current === trimmedEmail) {
        setIsSubmitting(false);
      }
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    const validationMsg = validatePassword(newPassword);
    if (validationMsg) {
      setError(validationMsg);
      return;
    }

    if (!resetToken) {
      setError('Phiên làm việc đã hết hạn hoặc trang đã được tải lại. Vui lòng yêu cầu mã mới.');
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(resetToken, newPassword);
      setResetToken(null);
      setIsReset(true);
    } catch (submitError) {
      const errCode = submitError instanceof ApiError ? submitError.body.code : undefined;
      if (errCode === 'RESET_GRANT_STALE') {
        setError('Trạng thái tài khoản hoặc mật khẩu đã thay đổi. Vui lòng yêu cầu mã mới.');
        setResetToken(null);
        setStep('otp');
        syncLocationStep('otp');
      } else if (errCode === 'RESET_GRANT_EXPIRED') {
        setError('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu mã mới.');
        setResetToken(null);
        setStep('otp');
        syncLocationStep('otp');
      } else if (errCode === 'RESET_GRANT_EXHAUSTED') {
        setError('Yêu cầu đặt lại mật khẩu đã được sử dụng. Vui lòng yêu cầu mã mới.');
        setResetToken(null);
        setStep('otp');
        syncLocationStep('otp');
      } else {
        setError('Không thể đặt lại mật khẩu. Hãy kiểm tra lại thông tin và thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isReset) {
    return (
      <section className="auth-page">
        <h1>Đặt lại mật khẩu</h1>
        <p role="status">Mật khẩu đã được đặt lại thành công. Hãy đăng nhập bằng mật khẩu mới.</p>
        <button type="button" onClick={() => navigate('/login', { state: { email } })}>
          Đăng nhập ngay
        </button>
      </section>
    );
  }

  // Step 3 with lost grant (page reload / F5)
  if (step === 'password' && !resetToken) {
    return (
      <section className="auth-page">
        <h1>Đặt lại mật khẩu</h1>
        <p className="state state--error" role="alert">
          Phiên làm việc đã hết hạn hoặc trang đã được tải lại. Vui lòng yêu cầu mã mới.
        </p>
        <button
          type="button"
          disabled={isResending || isSubmitting || remainingSeconds > 0 || !email.trim()}
          onClick={async () => {
            await onResend();
            setStep('otp');
            syncLocationStep('otp');
          }}
        >
          {isResending
            ? 'Đang gửi yêu cầu…'
            : remainingSeconds > 0
              ? `Gửi lại sau ${remainingSeconds}s`
              : 'Yêu cầu mã mới'}
        </button>
        <p style={{ marginTop: '1rem' }}>
          <Link to="/quen-mat-khau">Quay lại trang quên mật khẩu</Link>
        </p>
      </section>
    );
  }

  // Step 3: Enter new password
  if (step === 'password') {
    return (
      <section className="auth-page">
        <h1>Đặt lại mật khẩu</h1>
        <p className="auth-form__subtitle">
          Nhập mật khẩu mới cho tài khoản <strong>{email}</strong>
        </p>
        <form className="auth-form" onSubmit={onResetPassword}>
          <label>
            Mật khẩu mới
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
              >
                {showPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </label>

          <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
            <p className="auth-form__hint">Mật khẩu cần đáp ứng:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
              {passwordRequirements(newPassword).map(({ label, met }) => (
                <li
                  key={label}
                  style={{ color: met ? 'var(--color-success, #2e7d32)' : 'inherit' }}
                >
                  <span aria-hidden="true">{met ? '✓ ' : '○ '}</span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <label>
            Xác nhận mật khẩu mới
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? 'Ẩn xác nhận mật khẩu' : 'Hiện xác nhận mật khẩu'}
              >
                {showConfirmPassword ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </label>

          {error && (
            <p className="state state--error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={isSubmitting || !newPassword || !confirmPassword}>
            {isSubmitting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
          </button>
        </form>
      </section>
    );
  }

  // Step 2: Verify OTP
  return (
    <section className="auth-page">
      <h1>Xác thực mã đặt lại mật khẩu</h1>

      {statusMessage && <p role="status">{statusMessage}</p>}

      <form className="auth-form" onSubmit={onVerifyOtp}>
        {isEditingEmail ? (
          <label>
            Email
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email"
                value={email}
                onChange={(event) => handleEmailChange(event.target.value)}
                autoComplete="email"
                required
                style={{ flex: 1 }}
              />
              {email && (
                <button type="button" onClick={() => setIsEditingEmail(false)}>
                  Xong
                </button>
              )}
            </div>
          </label>
        ) : (
          <div style={{ marginBottom: '1rem' }}>
            <span>
              Email: <strong>{email}</strong>
            </span>{' '}
            <button
              type="button"
              style={{ fontSize: '0.85rem', marginLeft: '0.5rem' }}
              onClick={() => setIsEditingEmail(true)}
            >
              Đổi email
            </button>
          </div>
        )}

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
            placeholder="000000"
            required
          />
        </label>

        {error && (
          <p className="state state--error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting || isResending || code.length !== 6 || !email}>
          {isSubmitting ? 'Đang xác thực…' : 'Xác thực mã'}
        </button>
      </form>

      <div style={{ marginTop: '1.5rem' }}>
        <p>Chưa nhận được mã? Kiểm tra thư rác hoặc gửi lại yêu cầu.</p>
        <button
          type="button"
          disabled={isResending || isSubmitting || remainingSeconds > 0 || !email}
          onClick={onResend}
        >
          {isResending
            ? 'Đang gửi yêu cầu…'
            : remainingSeconds > 0
              ? `Gửi lại sau ${remainingSeconds}s`
              : 'Gửi lại mã'}
        </button>
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link to="/quen-mat-khau">Quay lại trang quên mật khẩu</Link>
      </p>
    </section>
  );
}
