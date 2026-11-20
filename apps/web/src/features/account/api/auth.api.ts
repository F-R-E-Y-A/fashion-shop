import { apiRequest } from '@/core';

import type {
  AuthenticatedUser,
  AuthResponse,
  Credentials,
  ForgotPasswordResponse,
  RegisterResponse,
  ResendVerificationResponse,
  ResetPasswordResponse,
  VerifyEmailResponse,
  VerifyPasswordResetOtpResponse,
} from '../types.js';

const cookieRequest = { credentials: 'include' as const };

export const register = (credentials: Credentials): Promise<RegisterResponse> =>
  apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body: credentials });

export const verifyEmail = (email: string, code: string): Promise<VerifyEmailResponse> =>
  apiRequest<VerifyEmailResponse>('/auth/verify-email', { method: 'POST', body: { email, code } });

export const resendVerification = (email: string): Promise<ResendVerificationResponse> =>
  apiRequest<ResendVerificationResponse>('/auth/resend-verification', {
    method: 'POST',
    body: { email },
  });

export const forgotPassword = (email: string): Promise<ForgotPasswordResponse> =>
  apiRequest<ForgotPasswordResponse>('/auth/forgot-password', { method: 'POST', body: { email } });

export const verifyPasswordResetOtp = (
  email: string,
  code: string,
): Promise<VerifyPasswordResetOtpResponse> =>
  apiRequest<VerifyPasswordResetOtpResponse>('/auth/verify-password-reset-otp', {
    method: 'POST',
    body: { email, code },
  });

export function resetPassword(
  resetToken: string,
  newPassword: string,
): Promise<ResetPasswordResponse>;
export function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordResponse>;
export function resetPassword(
  tokenOrEmail: string,
  codeOrPassword: string,
  maybePassword?: string,
): Promise<ResetPasswordResponse> {
  const body =
    maybePassword !== undefined
      ? { email: tokenOrEmail, code: codeOrPassword, newPassword: maybePassword }
      : { resetToken: tokenOrEmail, newPassword: codeOrPassword };
  return apiRequest<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body,
  });
}

export const login = (credentials: Credentials, signal?: AbortSignal): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: credentials,
    signal,
    ...cookieRequest,
  });

export const refresh = (signal?: AbortSignal): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/refresh', { method: 'POST', signal, ...cookieRequest });

export const logout = (signal?: AbortSignal): Promise<void> =>
  apiRequest<void>('/auth/logout', { method: 'POST', signal, ...cookieRequest });

export const getCurrentUser = (accessToken: string): Promise<AuthenticatedUser> =>
  apiRequest<AuthenticatedUser>('/auth/me', { accessToken });
