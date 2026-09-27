import { apiRequest } from '@/core';

import type {
  AuthenticatedUser,
  AuthResponse,
  Credentials,
  RegisterResponse,
  ResendVerificationResponse,
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

export const login = (credentials: Credentials): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: credentials, ...cookieRequest });

export const refresh = (): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/refresh', { method: 'POST', ...cookieRequest });

export const logout = (): Promise<void> =>
  apiRequest<void>('/auth/logout', { method: 'POST', ...cookieRequest });

export const getCurrentUser = (accessToken: string): Promise<AuthenticatedUser> =>
  apiRequest<AuthenticatedUser>('/auth/me', { accessToken });
