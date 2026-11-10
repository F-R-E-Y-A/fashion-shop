import { matchRoutes } from 'react-router-dom';
import isEmail from 'validator/lib/isEmail.js';

import { ApiError } from '@/core';

export const AUTH_MESSAGES = {
  emailRequired: 'Vui lòng nhập email.',
  emailInvalid: 'Email chưa đúng định dạng.',
  passwordRequired: 'Vui lòng nhập mật khẩu.',
  passwordPolicy: 'Mật khẩu cần tối thiểu 8 ký tự, một chữ hoa A–Z và một số 0–9.',
  confirmationRequired: 'Vui lòng xác nhận mật khẩu.',
  confirmationMismatch: 'Mật khẩu xác nhận không khớp.',
  otpRequired: 'Vui lòng nhập mã xác thực.',
  otpFormat: 'Nhập mã gồm 6 chữ số.',
  accepted:
    'Yêu cầu đã được tiếp nhận. Nếu email đủ điều kiện, bạn sẽ nhận được mã. Hãy kiểm tra hộp thư và thư rác. Nếu nhận được mã mới, hãy thay mã đang nhập bằng mã trong email mới nhất.',
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return AUTH_MESSAGES.emailRequired;
  // Backend dùng @IsEmail({}) sau normalizeEmail; dùng cùng validator và options mặc định.
  if (!isEmail(normalizeEmail(email), {})) return AUTH_MESSAGES.emailInvalid;
}

// Giữ đúng cách đếm và các điều kiện hiện tại của backend; migration policy cần duyệt riêng.
export function passwordRequirements(password: string) {
  return [
    { label: 'Tối thiểu 8 ký tự', met: password.length >= 8 },
    { label: 'Có ít nhất một chữ hoa A–Z', met: /[A-Z]/u.test(password) },
    { label: 'Có ít nhất một số 0–9', met: /\d/u.test(password) },
  ];
}

export function validatePassword(password: string): string | undefined {
  if (!password) return AUTH_MESSAGES.passwordRequired;
  if (passwordRequirements(password).some(({ met }) => !met)) return AUTH_MESSAGES.passwordPolicy;
}

export function validateConfirmation(confirmation: string, password: string): string | undefined {
  if (!confirmation) return AUTH_MESSAGES.confirmationRequired;
  if (confirmation !== password) return AUTH_MESSAGES.confirmationMismatch;
}

export function validateOtp(code: string): string | undefined {
  if (!code) return AUTH_MESSAGES.otpRequired;
  if (!/^\d{6}$/u.test(code)) return AUTH_MESSAGES.otpFormat;
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return error instanceof TypeError ? 'Không thể kết nối. Kiểm tra mạng rồi thử lại.' : fallback;
  }
  if (error.body.statusCode === 429)
    return 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ rồi thử lại.';
  if (error.body.statusCode >= 500) return 'Dịch vụ tạm thời chưa khả dụng. Vui lòng thử lại sau.';
  return fallback;
}

export const OTP_ERROR_MESSAGES: Record<string, string> = {
  OTP_INVALID: 'Mã xác thực không đúng. Hãy kiểm tra email và mã.',
  OTP_EXPIRED: 'Mã xác thực đã hết hạn. Hãy bấm gửi lại mã.',
  OTP_ATTEMPTS_EXCEEDED: 'Bạn đã nhập sai quá số lần cho phép. Hãy bấm gửi lại mã.',
};

const authReturnRoutes = [
  '/login',
  '/register',
  '/xac-thuc-email',
  '/quen-mat-khau',
  '/dat-lai-mat-khau',
].map((path) => ({ path }));

export function safeReturnLocation(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      [...decoded].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      return;
    const url = new URL(value, 'https://store.invalid');
    if (url.origin !== 'https://store.invalid') return;
    // Tránh vòng lặp quay về màn hình xác thực sau khi đăng nhập.
    if (matchRoutes(authReturnRoutes, url.pathname)) return;
    return url.pathname + url.search + url.hash;
  } catch {
    return;
  }
}

export function readAuthNavigation(state: unknown) {
  const context = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return {
    email: typeof context.email === 'string' ? normalizeEmail(context.email) : '',
    from: safeReturnLocation(context.from),
    resendAvailableAt:
      typeof context.resendAvailableAt === 'number' && Number.isFinite(context.resendAvailableAt)
        ? Math.min(context.resendAvailableAt, Date.now() + 60_000)
        : 0,
  };
}
