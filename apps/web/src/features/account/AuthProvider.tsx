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

import {
  login as loginRequest,
  logout as logoutRequest,
  refresh,
  register as registerRequest,
} from './api/index.js';
import type { AuthenticatedUser, AuthResponse, Credentials, RegisterResponse } from './types.js';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(credentials: Credentials): Promise<void>;
  /** Chi tao tai khoan PENDING_VERIFICATION va gui OTP; KHONG dang nhap. */
  register(credentials: Credentials): Promise<RegisterResponse>;
  logout(): Promise<void>;
  /** Thanh cong thi xoa access token/user o bo nho: nguoi dung phai dang nhap lai. */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  authenticatedRequest<T>(
    path: string,
    options?: Omit<ApiRequestOptions, 'accessToken'>,
  ): Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_LOCK_NAME = 'fashion-shop:auth-refresh';

/**
 * Chay mot lan refresh voi khoa Web Locks (neu trinh duyet co): cac tab cung goc chia se MOT cookie
 * refresh, nen hai tab refresh SONG SONG se cung gui token cu, tab thua bi backend coi la replay va
 * thu hoi ca family (nguoi dung bi dang xuat khap noi, hay gap khi trinh duyet khoi phuc nhieu tab
 * cung luc). Khoa xep hang cac lan refresh: tab sau chi gui request khi phan hoi cua tab truoc da dat
 * lai cookie moi. Trinh duyet khong co Web Locks thi van duoc bao ve trong tung tab boi single-flight.
 */
function refreshOnce(): Promise<AuthResponse> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(REFRESH_LOCK_NAME, () => refresh()) : refresh();
}

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

    refreshInFlight.current = refreshOnce()
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

  const register = useCallback((credentials: Credentials) => registerRequest(credentials), []);

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

        // Backend phat hien replay refresh token (va thu hoi ca family) neu hai request cung mang
        // token cu di refresh, nen refresh phai la single-flight va khong duoc thua:
        //  - token hien tai khac token request nay da gui: request khac da refresh xong roi, dung lai
        //    token do thay vi rotate them mot lan nua;
        //  - token hien tai la null: auth da bi xoa trong luc cho (refresh cua request khac that bai,
        //    hoac dang xuat) -> nextToken rong, chi bao loi, KHONG thu refresh them;
        //  - con lai: chi MOT refresh chay, moi request 401 khac cung cho ket qua do.
        const current = accessTokenRef.current;
        const nextToken = current !== token ? current : await restoreAccessToken();
        if (!nextToken) throw error;
        return apiRequest<T>(path, {
          ...options,
          accessToken: nextToken,
          credentials: 'include',
        });
      }
    },
    [restoreAccessToken],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      await authenticatedRequest<void>('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      clearAuthentication();
    },
    [authenticatedRequest, clearAuthentication],
  );

  const value: AuthContextValue = {
    user,
    accessToken,
    isAuthenticated: user !== null,
    isLoading,
    login: (credentials) => authenticate(loginRequest, credentials),
    register,
    logout: async () => {
      clearAuthentication();
      try {
        await logoutRequest();
      } catch {
        // The local session remains cleared even when an idempotent logout request cannot finish.
      }
    },
    changePassword,
    authenticatedRequest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phai duoc dung ben trong AuthProvider');
  return context;
}
