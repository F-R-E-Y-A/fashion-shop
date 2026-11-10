import { QueryClientContext } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  sessionQueryKeys,
  setAccessTokenGetter,
} from '@/core';
import { cartKeys, mergeCart } from '@/features/cart';

import {
  login as loginRequest,
  logout as logoutRequest,
  refresh,
  register as registerRequest,
} from './api/index.js';
import {
  createAuthLock,
  holdsCurrentSession,
  linkAbortSignals,
  openSessionChannel,
  readSessionMarker,
  SessionChangedError,
  type SessionChannel,
  type SessionMarker,
  sessionMarkerChanged,
  writeSessionMarker,
} from './session-sync.js';
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
  /** Ket qua thuoc phien da ket thuc hay da doi danh tinh thi nem SessionChangedError. */
  authenticatedRequest<T>(
    path: string,
    options?: Omit<ApiRequestOptions, 'accessToken'>,
  ): Promise<T>;
  /**
   * So hieu phien hien tai trong tab. Doi khi dang nhap, dang xuat, het phien, ke ca cung nguoi dung
   * dang nhap lai; refresh cung phien thi khong doi. Ket qua chi ghi khi so hieu con nguyen.
   */
  getSessionEpoch(): number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type RefreshOutcome =
  { status: 'ROTATED'; accessToken: string } | { status: 'FAILED' } | { status: 'SESSION_CHANGED' };

interface RefreshFlight {
  epoch: number;
  promise: Promise<RefreshOutcome>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useContext(QueryClientContext);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authLock] = useState(createAuthLock);
  const accessTokenRef = useRef<string | null>(null);
  const userRef = useRef<AuthenticatedUser | null>(null);
  // `epoch` tang moi khi danh tinh trong tab doi (dang nhap, dang xuat, het phien, tab khac doi phien).
  // Moi ket qua mang ghi lai epoch luc bat dau; ve toi ma epoch da khac thi bi bo, khong ghi state.
  // Refresh xoay token cho CUNG nguoi dung khong doi epoch, nen request cung phien van thu lai duoc.
  const epochRef = useRef(0);
  // `intent` tang moi khi nguoi dung BAT DAU dang nhap hay dang xuat: thao tac sau thang thao tac truoc.
  const intentRef = useRef(0);
  const sessionAbortRef = useRef(new AbortController());
  const knownMarkerRef = useRef<SessionMarker>(undefined);
  const refreshInFlight = useRef<RefreshFlight | null>(null);
  const channelRef = useRef<SessionChannel | null>(null);

  const purgeAccountData = useCallback(() => {
    void queryClient?.cancelQueries({ queryKey: sessionQueryKeys.all });
    queryClient?.removeQueries({ queryKey: sessionQueryKeys.all });
  }, [queryClient]);

  /** Mo mot epoch moi: huy moi request cua phien truoc va xoa cache tai khoan cua no. */
  const startEpoch = useCallback(
    (next: AuthResponse | null) => {
      epochRef.current += 1;
      sessionAbortRef.current.abort();
      sessionAbortRef.current = new AbortController();
      accessTokenRef.current = next?.accessToken ?? null;
      userRef.current = next?.user ?? null;
      setAccessToken(next?.accessToken ?? null);
      setUser(next?.user ?? null);
      purgeAccountData();
    },
    [purgeAccountData],
  );

  /** Chi xoa trang thai trong tab nay; khong goi may chu, khong dang xuat phien cua tab khac. */
  const endLocalSession = useCallback(() => startEpoch(null), [startEpoch]);

  /**
   * Mot lan refresh cho epoch hien tai (single-flight: moi 401 cung epoch dung chung).
   * `expectedUserId === null` la khoi phuc phien luc tai trang: nhan phien cua cookie hien co.
   * Giua phien thi KHONG nhan nguoi dung khac: cookie da bi tab khac doi, chi xoa trang thai local.
   */
  const refreshSession = useCallback(
    (expectedUserId: string | null): Promise<RefreshOutcome> => {
      const epoch = epochRef.current;
      const existing = refreshInFlight.current;
      if (existing && existing.epoch === epoch) return existing.promise;

      const initial = expectedUserId === null;
      const intent = intentRef.current;
      const stale = () => epochRef.current !== epoch || (initial && intentRef.current !== intent);

      const flight: RefreshFlight = { epoch, promise: Promise.resolve({ status: 'FAILED' }) };
      flight.promise = authLock(async (signal) => {
        // Co the da cho khoa lau: kiem lai ngay truoc khi gui, roi moi xoay cookie.
        if (stale()) return { kind: 'STALE' } as const;
        const marker = readSessionMarker();
        if (!initial && sessionMarkerChanged(knownMarkerRef.current, marker)) {
          return { kind: 'MARKER_CHANGED' } as const;
        }
        try {
          return { kind: 'OK', response: await refresh(signal), marker } as const;
        } catch {
          return { kind: 'ERROR' } as const;
        }
      })
        .then((result): RefreshOutcome => {
          if (result.kind === 'STALE' || stale()) return { status: 'SESSION_CHANGED' };
          if (result.kind === 'MARKER_CHANGED') {
            endLocalSession();
            return { status: 'SESSION_CHANGED' };
          }
          if (result.kind === 'ERROR') {
            endLocalSession();
            return { status: 'FAILED' };
          }
          if (initial) {
            knownMarkerRef.current = result.marker;
            startEpoch(result.response);
          } else if (result.response.user.id !== expectedUserId) {
            endLocalSession();
            return { status: 'SESSION_CHANGED' };
          } else {
            accessTokenRef.current = result.response.accessToken;
            userRef.current = result.response.user;
            setAccessToken(result.response.accessToken);
            setUser(result.response.user);
          }
          return { status: 'ROTATED', accessToken: result.response.accessToken };
        })
        .finally(() => {
          if (refreshInFlight.current === flight) refreshInFlight.current = null;
        });
      refreshInFlight.current = flight;
      return flight.promise;
    },
    [authLock, endLocalSession, startEpoch],
  );

  useEffect(() => {
    setAccessTokenGetter(() => accessTokenRef.current);
    return () => {
      setAccessTokenGetter(null);
    };
  }, []);

  useEffect(() => {
    void refreshSession(null).finally(() => setIsLoading(false));
  }, [refreshSession]);

  // Tab khac dang nhap, dang xuat hay doi mat khau: chi xoa trang thai local, khong tu nhan phien moi.
  // Tin nhan khong noi phien nao; dau phien moi noi. Dau minh giu van la dau hien tai thi tin nay cu
  // hon phien cua tab (vd tin den muon cua lan dang nhap truoc khi tab nay dang nhap): bo qua.
  useEffect(() => {
    const channel = openSessionChannel(() => {
      if (userRef.current && !holdsCurrentSession(knownMarkerRef.current)) endLocalSession();
    });
    channelRef.current = channel;
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [endLocalSession]);

  // Gop gio hang khach vang lai vao gio cua tai khoan ngay khi xac thuc thanh cong (dang nhap,
  // xac thuc email, hoac khoi phuc phien). Chay dung mot lan moi phien dang nhap: sau khi gop,
  // guestToken o localStorage bi xoa nen lan sau khong con gi de gop. Gop that bai thi giu
  // nguyen guestToken — mon do van con o gio rieng, khong mat du lieu.
  const mergedForUserId = useRef<string | null>(null);
  useEffect(() => {
    const userId = user?.id;
    if (!userId || mergedForUserId.current === userId) return;
    mergedForUserId.current = userId;

    const guestToken = localStorage.getItem('guestToken');
    if (!guestToken) return;

    void mergeCart(guestToken)
      .then(() => {
        localStorage.removeItem('guestToken');
        void queryClient?.invalidateQueries({ queryKey: cartKeys.all });
      })
      .catch(() => {
        mergedForUserId.current = null;
      });
  }, [user?.id, queryClient]);

  const login = useCallback(
    async (credentials: Credentials) => {
      const intent = (intentRef.current += 1);
      const response = await authLock(async (signal) => {
        if (intentRef.current !== intent) return null;
        const result = await loginRequest(credentials, signal);
        // Cookie da la cua phien moi ngay khi phan hoi ve, du ket qua co con duoc dung hay khong.
        knownMarkerRef.current = writeSessionMarker();
        return result;
      });
      // Nguoi dung da dang xuat (hay dang nhap lai) sau khi bam: thao tac moi hon se thu hoi phien nay.
      if (!response || intentRef.current !== intent) throw new SessionChangedError();
      startEpoch(response);
      channelRef.current?.notify();
    },
    [authLock, startEpoch],
  );

  const logout = useCallback(async () => {
    intentRef.current += 1;
    endLocalSession();
    try {
      const ended = await authLock(async (signal) => {
        // Tab khac da dang nhap phien khac: cookie khong con la cua tab nay. Khong thu hoi, khong doi
        // dau phien, khong bao tin: phien cu khong duoc xoa phien moi.
        if (sessionMarkerChanged(knownMarkerRef.current, readSessionMarker())) return false;
        // Doi dau TRUOC khi goi mang: logout loi mang van ket thuc phien o moi tab cua trinh duyet.
        knownMarkerRef.current = writeSessionMarker();
        try {
          await logoutRequest(signal);
        } catch {
          // The local session remains cleared even when an idempotent logout request cannot finish.
        }
        return true;
      });
      if (ended) channelRef.current?.notify();
    } catch {
      // Khoa khong lay duoc: trang thai local da xoa o tren.
    }
  }, [authLock, endLocalSession]);

  const register = useCallback((credentials: Credentials) => registerRequest(credentials), []);

  const authenticatedRequest = useCallback(
    async <T,>(path: string, options: Omit<ApiRequestOptions, 'accessToken'> = {}): Promise<T> => {
      const epoch = epochRef.current;
      const userId = userRef.current?.id;
      const token = accessTokenRef.current;
      if (!token || !userId) throw new Error('Yeu cau nay can dang nhap');

      const sessionSignal = sessionAbortRef.current.signal;
      const sameSession = () => epochRef.current === epoch;
      const send = async (bearer: string): Promise<T> => {
        const linked = linkAbortSignals([options.signal, sessionSignal]);
        try {
          const result = await apiRequest<T>(path, {
            ...options,
            signal: linked.signal,
            accessToken: bearer,
            credentials: 'include',
          });
          if (!sameSession()) throw new SessionChangedError();
          return result;
        } catch (error) {
          if (!sameSession()) throw new SessionChangedError();
          throw error;
        } finally {
          linked.dispose();
        }
      };

      try {
        return await send(token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.body.statusCode !== 401) throw error;

        // Backend phat hien replay refresh token (va thu hoi ca family) neu hai request cung mang
        // token cu di refresh, nen refresh phai la single-flight va khong duoc thua:
        //  - cung epoch ma token da xoay boi request khac: dung token do, khong rotate them;
        //  - con lai: chi MOT refresh chay cho epoch nay, moi request 401 khac cung cho ket qua do.
        // Khong bao gio gui lai bang token cua danh tinh khac: doi epoch la SessionChangedError.
        const current = accessTokenRef.current;
        let nextToken: string;
        if (current && current !== token) {
          nextToken = current;
        } else {
          const outcome = await refreshSession(userId);
          if (outcome.status === 'FAILED') throw error;
          if (outcome.status === 'SESSION_CHANGED' || !sameSession()) {
            throw new SessionChangedError();
          }
          nextToken = outcome.accessToken;
        }
        return send(nextToken);
      }
    },
    [refreshSession],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      const epoch = epochRef.current;
      const userId = userRef.current?.id;
      if (!userId) throw new Error('Yeu cau nay can dang nhap');
      const sameSession = () => epochRef.current === epoch;

      // Doi mat khau XOA cookie refresh nen phai xep hang cung login/logout/refresh. Trong khoa chi
      // co mot lan goi tho; 401 thi lam moi phien NGOAI khoa (refresh tu xin khoa) roi moi thu lai.
      const attempt = () =>
        authLock(async (signal) => {
          const bearer = accessTokenRef.current;
          if (!sameSession() || !bearer) throw new SessionChangedError();
          if (sessionMarkerChanged(knownMarkerRef.current, readSessionMarker())) {
            endLocalSession();
            throw new SessionChangedError();
          }
          await apiRequest<void>('/auth/change-password', {
            method: 'POST',
            body: { currentPassword, newPassword },
            accessToken: bearer,
            credentials: 'include',
            signal,
          });
          // May chu da thu hoi moi phien va xoa cookie: phien cua trinh duyet ket thuc.
          knownMarkerRef.current = writeSessionMarker();
        });

      try {
        await attempt();
      } catch (error) {
        if (error instanceof SessionChangedError) throw error;
        if (!sameSession()) throw new SessionChangedError();
        if (!(error instanceof ApiError) || error.body.statusCode !== 401) throw error;
        const outcome = await refreshSession(userId);
        if (outcome.status === 'FAILED') throw error;
        if (outcome.status === 'SESSION_CHANGED' || !sameSession()) {
          throw new SessionChangedError();
        }
        await attempt();
      }
      endLocalSession();
      channelRef.current?.notify();
    },
    [authLock, endLocalSession, refreshSession],
  );

  const getSessionEpoch = useCallback(() => epochRef.current, []);

  const value: AuthContextValue = {
    user,
    accessToken,
    isAuthenticated: user !== null,
    isLoading,
    login,
    register,
    logout,
    changePassword,
    authenticatedRequest,
    getSessionEpoch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth phai duoc dung ben trong AuthProvider');
  return context;
}
