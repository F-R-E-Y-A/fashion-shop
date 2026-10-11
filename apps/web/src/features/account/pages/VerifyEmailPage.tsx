import { type FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { resendVerification, verifyEmail } from '../api/index.js';

const RESEND_COOLDOWN_SECONDS = 60;

const OTP_ERROR_MESSAGES: Record<string, string> = {
  OTP_INVALID: 'Mã xác thực không đúng.',
  OTP_EXPIRED: 'Mã xác thực đã hết hạn. Hãy bấm gửi lại mã.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã nhập sai quá số lần cho phép. Hãy bấm gửi lại mã.',
};

export function VerifyEmailPage() {
  const location = useLocation() as { state?: { email?: string } };
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResendMessage(null);
    setIsVerifying(true);
    try {
      await verifyEmail(email, code);
      setIsVerified(true);
    } catch (submitError) {
      const otpCode = submitError instanceof ApiError ? submitError.body.code : undefined;
      setError(
        (otpCode && OTP_ERROR_MESSAGES[otpCode]) ??
          'Không thể xác thực. Hãy kiểm tra lại mã và thử lại.',
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function onResend() {
    setError(null);
    setResendMessage(null);
    try {
      await resendVerification(email);
      setResendMessage('Nếu email hợp lệ và đang chờ xác thực, một mã mới đã được gửi.');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError('Không thể gửi lại mã lúc này. Hãy thử lại sau.');
    }
  }

  if (isVerified) {
    return (
      <section className="auth-page">
        <h1>Xác thực email</h1>
        <p role="status">Tài khoản của bạn đã được xác thực. Hãy đăng nhập để tiếp tục.</p>
        <button type="button" onClick={() => navigate('/login', { state: { email } })}>
          Đăng nhập ngay
        </button>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <h1>Xác thực email</h1>
      <p>Nhập mã 6 số đã gửi tới email của bạn. Mã có hiệu lực trong 10 phút.</p>
      <form className="auth-form" onSubmit={onVerify}>
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
          Mã xác thực
          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            data-otp="true"
            placeholder="••••••"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            autoComplete="one-time-code"
            required
          />
        </label>
        {error && (
          <p className="state state--error" role="alert">
            {error}
          </p>
        )}
        {resendMessage && (
          <p className="state" role="status">
            {resendMessage}
          </p>
        )}
        <button type="submit" disabled={isVerifying || code.length !== 6 || !email}>
          {isVerifying ? 'Đang xác thực…' : 'Xác thực'}
        </button>
      </form>
      <p>
        Chưa nhận được mã?{' '}
        <button
          type="button"
          onClick={() => void onResend()}
          disabled={resendCooldown > 0 || !email}
        >
          {resendCooldown > 0 ? `Gửi lại sau ${resendCooldown}s` : 'Gửi lại mã'}
        </button>
      </p>
      <p>
        Đã xác thực rồi? <Link to="/login">Đăng nhập</Link>
      </p>
    </section>
  );
}
