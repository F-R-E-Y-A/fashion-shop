import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { ApiError, apiRequest, type ApiRequestOptions } from '@/core';

import { login as loginRequest, logout as logoutRequest, refresh, register } from './api/index.js';
import type { AuthenticatedUser, AuthResponse, Credentials } from './types.js';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(credentials: Credentials): Promise<void>;
  register(credentials: Credentials): Promise<void>;
  logout(): Promise<void>;
  authenticatedRequest<T>(
    path: string,
    options?: Omit<ApiRequestOptions, 'accessToken'>,
  ): Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const applyAuthentication = useCallback((response: AuthResponse) => {
    accessTokenRef.current = response.accessToken;
    setAccessToken(response.accessToken);
    setUser(response.user);
  }, []);

  const clearAuthentication = useCallback(() => {
    accessTokenRef.current = null;
    setAccessToken(null);
    setUser(null);
  }, []);

  const restoreAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current;

    refreshInFlight.current = refresh()
      .then((response) => {
        applyAuthentication(response);
        return response.accessToken;
      })
      .catch(() => {
        clearAuthentication();
        return null;
      })
      .finally(() => {
        refreshInFlight.current = null;
      });
    return refreshInFlight.current;
  }, [applyAuthentication, clearAuthentication]);

  useEffect(() => {
    void restoreAccessToken().finally(() => setIsLoading(false));
  }, [restoreAccessToken]);

  const authenticate = useCallback(
    async (
      request: (credentials: Credentials) => Promise<AuthResponse>,
      credentials: Credentials,
    ) => {
      applyAuthentication(await request(credentials));
    },
    [applyAuthentication],
  );

  const authenticatedRequest = useCallback(
    async <T,>(path: string, options: Omit<ApiRequestOptions, 'accessToken'> = {}): Promise<T> => {
      const token = accessTokenRef.current;
      if (!token) throw new Error('Yeu cau nay can dang nhap');

      try {
        return await apiRequest<T>(path, {
          ...options,
          accessToken: token,
          credentials: 'include',
        });
      } catch (error) {
        if (!(error instanceof ApiError) || error.body.statusCode !== 401) throw error;

        const refreshedToken = await restoreAccessToken();
        if (!refreshedToken) throw error;
        return apiRequest<T>(path, {
          ...options,
          accessToken: refreshedToken,
          credentials: 'include',
        });
      }
    },
    [restoreAccessToken],
  );

  const value: AuthContextValue = {
    user,
    accessToken,
    isAuthenticated: user !== null,
    isLoading,
    login: (credentials) => authenticate(loginRequest, credentials),
    register: (credentials) => authenticate(register, credentials),
    logout: async () => {
      clearAuthentication();
      try {
        await logoutRequest();
      } catch {
        // The local session remains cleared even when an idempotent logout request cannot finish.
      }
    },
    authenticatedRequest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phai duoc dung ben trong AuthProvider');
  return context;
}
