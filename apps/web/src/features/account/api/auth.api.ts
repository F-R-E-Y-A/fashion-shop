import { apiRequest } from '@/core';

import type { AuthenticatedUser, AuthResponse, Credentials } from '../types.js';

const cookieRequest = { credentials: 'include' as const };

export const register = (credentials: Credentials): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: credentials,
    ...cookieRequest,
  });

export const login = (credentials: Credentials): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: credentials, ...cookieRequest });

export const refresh = (): Promise<AuthResponse> =>
  apiRequest<AuthResponse>('/auth/refresh', { method: 'POST', ...cookieRequest });

export const logout = (): Promise<void> =>
  apiRequest<void>('/auth/logout', { method: 'POST', ...cookieRequest });

export const getCurrentUser = (accessToken: string): Promise<AuthenticatedUser> =>
  apiRequest<AuthenticatedUser>('/auth/me', { accessToken });
