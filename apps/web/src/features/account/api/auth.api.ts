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

export const resetPassword = (
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordResponse> =>
  apiRequest<ResetPasswordResponse>('/auth/reset-password', {
    method: 'POST',
    body: { email, code, newPassword },
  });

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
