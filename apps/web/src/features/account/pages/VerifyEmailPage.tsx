import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { ApiError } from '@/core';

import { resendVerification, verifyEmail } from '../api/index.js';
import {
  AUTH_MESSAGES,
  authErrorMessage,
  normalizeEmail,
  OTP_ERROR_MESSAGES,
  readAuthNavigation,
  validateEmail,
  validateOtp,
} from '../auth-form.js';
import {
  AuthField,
  AuthNotice,
  AuthSubmitButton,
  OtpField,
  ResendCode,
} from '../components/AuthForm.js';
import styles from '../components/AuthForm.module.css';
import { useAuthForm } from '../useAuthForm.js';

export function VerifyEmailPage() {
  const location = useLocation();
  return <VerifyEmailForm key={location.key} context={readAuthNavigation(location.state)} />;
}

function VerifyEmailForm({ context }: { context: ReturnType<typeof readAuthNavigation> }) {
  const navigate = useNavigate();
  const form = useAuthForm({ email: context.email, code: '' }, (values) => ({
    email: validateEmail(values.email),
    code: validateOtp(values.code),
  }));
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>(() =>
    context.email && context.resendAvailableAt
      ? { [context.email]: context.resendAvailableAt }
      : {},
  );
  const [now, setNow] = useState(() => Date.now());
  const requestInFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const email = normalizeEmail(form.values.email);
  const deadline = cooldowns[email] ?? 0;
  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1_000));
  const busy = isVerifying || isResending;

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= deadline) window.clearInterval(timer);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current) return;
    setError(null);
    setResendMessage(null);
    if (!form.validateForSubmit(event.currentTarget)) return;
    requestInFlight.current = true;
    setIsVerifying(true);
    try {
      await verifyEmail(email, form.values.code);
      form.resetField('code');
      setIsVerified(true);
    } catch (submitError) {
      const code = submitError instanceof ApiError ? submitError.body.code : undefined;
      if (code && Object.hasOwn(OTP_ERROR_MESSAGES, code)) {
        form.setServerErrors({ code: OTP_ERROR_MESSAGES[code] });
      } else {
        setError(
          authErrorMessage(
            submitError,
            'Không thể xác thực. Hãy kiểm tra lại thông tin và thử lại.',
          ),
        );
      }
    } finally {
      requestInFlight.current = false;
      setIsVerifying(false);
    }
  }

  async function onResend() {
    if (requestInFlight.current || Date.now() < deadline || !formRef.current) return;
    setError(null);
    setResendMessage(null);
    if (!form.validateForSubmit(formRef.current, ['email'])) return;
    requestInFlight.current = true;
    setIsResending(true);
    try {
      await resendVerification(email);
      const acceptedAt = Date.now();
      setCooldowns((current) => ({ ...current, [email]: acceptedAt + 60_000 }));
      setNow(acceptedAt);
      setResendMessage(AUTH_MESSAGES.accepted);
    } catch (submitError) {
      setError(
        authErrorMessage(submitError, 'Không thể gửi lại yêu cầu lúc này. Hãy thử lại sau.'),
      );
    } finally {
      requestInFlight.current = false;
      setIsResending(false);
    }
  }

  if (isVerified)
    return (
      <section className={styles.page}>
        <h1>Xác thực email</h1>
        <AuthNotice
          kind="status"
          message="Tài khoản của bạn đã được xác thực. Hãy đăng nhập để tiếp tục."
        />
        <p className={styles.destination}>{email}</p>
        <AuthSubmitButton
          type="button"
          onClick={() =>
            navigate('/login', { replace: true, state: { email, from: context.from } })
          }
        >
          Đăng nhập ngay
        </AuthSubmitButton>
      </section>
    );

  return (
    <section className={styles.page}>
      <h1>Xác thực email</h1>
      <p className={styles.intro}>
        Nhập mã 6 số trong email xác thực. Mã có hiệu lực 10 phút kể từ lúc được tạo; tối đa 5 lần
        nhập sai.
      </p>
      {email && (
        <p className={styles.destination}>
          Email nhận mã: <strong>{email}</strong>
        </p>
      )}
      <form
        ref={formRef}
        className={styles.form}
        noValidate
        onSubmit={onVerify}
        aria-busy={busy}
        aria-label="Xác thực email"
      >
        <AuthField
          id="verify-email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={busy}
          value={form.values.email}
          error={form.errors.email}
          hint="Nếu sửa email, hãy dùng mã được tạo cho email mới."
          onBlur={() => form.touch('email')}
          onChange={(event) => {
            form.setField('email', event.target.value);
            form.resetField('code');
            form.setServerErrors({});
            setError(null);
            setResendMessage(null);
            setNow(Date.now());
          }}
        />
        <OtpField
          id="verify-code"
          name="code"
          label="Mã xác thực"
          required
          disabled={busy}
          value={form.values.code}
          error={form.errors.code}
          hint="Nhập hoặc dán đủ 6 chữ số. Giữ nguyên số 0 ở đầu mã."
          onBlur={() => form.touch('code')}
          onValueChange={(code) => {
            form.setField('code', code);
            setError(null);
          }}
        />
        <AuthNotice message={error} />
        <AuthSubmitButton
          pending={isVerifying}
          pendingLabel="Đang xác thực…"
          disabled={isResending}
        >
          Xác thực
        </AuthSubmitButton>
      </form>
      <ResendCode
        pending={isResending}
        remainingSeconds={remainingSeconds}
        disabled={isVerifying}
        onResend={() => void onResend()}
      />
      <AuthNotice kind="status" message={resendMessage} />
      <p className={styles.navigation}>
        Nhập sai email khi đăng ký?{' '}
        <Link to="/register" state={{ from: context.from }}>
          Đăng ký với email đúng
        </Link>
      </p>
      <p className={styles.navigation}>
        Đã xác thực rồi?{' '}
        <Link to="/login" state={{ email, from: context.from }}>
          Đăng nhập
        </Link>
      </p>
    </section>
  );
}
