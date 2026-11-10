import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { forgotPassword } from '../api/index.js';

const GENERIC_MESSAGE = 'Nếu email tồn tại và đủ điều kiện, mã đặt lại mật khẩu đã được gửi.';
const RETRY_ERROR_MESSAGE = 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      setIsSubmitted(true);
    } catch {
      // Never surface the underlying error (network failure, 5xx, SMTP issue, ...): only this
      // fixed retry prompt, so a request failure cannot be used to learn anything about the
      // account or the backend. A real "not eligible" case never throws — the API always answers
      // 200 { accepted: true } for it — so reaching this branch means the request itself failed.
      setError(RETRY_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-page">
      <h1>Quên mật khẩu</h1>
      {isSubmitted ? (
        <>
          <p role="status">{GENERIC_MESSAGE}</p>
          <button type="button" onClick={() => navigate('/dat-lai-mat-khau', { state: { email } })}>
            Tôi đã có mã
          </button>
        </>
      ) : (
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
          {error && (
            <p className="state state--error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang gửi…' : 'Gửi mã đặt lại mật khẩu'}
          </button>
        </form>
      )}
      <p>
        Nhớ mật khẩu rồi? <Link to="/login">Đăng nhập</Link>
      </p>
    </section>
  );
}
