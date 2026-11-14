/**
 * MOT cho duy nhat goi ra may chu. Khong feature nao duoc tu goi fetch.
 *
 * Ban 0.2 viet tay cho gon. Khi dac ta API on dinh se thay bang thu vien goi sinh tu
 * /api/docs-json, luc do kieu du lieu khop may chu tu dong (docs/TECH_DEBT.md muc ND-02).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

/** Stream nay chi chua revision cong khai, khong gui access token tren URL. */
export function openEventStream(path: string): EventSource {
  return new EventSource(`${BASE_URL}${path}`);
}

/** Hinh dang loi thong nhat, khop AllExceptionsFilter ben may chu. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.name = 'ApiError';
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  accessToken?: string;
  credentials?: RequestCredentials;
  /** Huy yeu cau dang bay, vd goi y tim kiem khi khach go tiep. */
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

let accessTokenGetter: (() => string | null) | null = null;

export function setAccessTokenGetter(getter: (() => string | null) | null): void {
  accessTokenGetter = getter;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = options.accessToken ?? accessTokenGetter?.();
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: options.credentials,
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body ?? {
        statusCode: response.status,
        code: 'UNKNOWN',
        message: `May chu tra ve ma ${response.status}`,
        path,
        timestamp: new Date().toISOString(),
      },
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Tuy chon rieng cua GET: huy yeu cau dang bay va header phu (vd x-guest-token cua gio hang). */
export interface ApiGetOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiGet<T>(
  path: string,
  params?: QueryParams,
  options: ApiGetOptions = {},
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const search = query.toString();
  return apiRequest<T>(search ? `${path}?${search}` : path, options);
}

export const apiPost = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
  apiRequest<T>(path, { method: 'POST', body, headers });

export const apiPatch = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
  apiRequest<T>(path, { method: 'PATCH', body, headers });

export const apiDel = <T>(path: string, headers?: Record<string, string>) =>
  apiRequest<T>(path, { method: 'DELETE', headers });

/**
 * Gui form multipart toi kho anh ngoai (Cloudinary) bang phieu may chu da ky. KHONG gan access
 * token: token cua cua hang khong bao gio roi khoi may chu cua hang. Loi tra Error thuong, vi than
 * loi cua kho ngoai khong theo hinh dang ApiErrorBody.
 */
export async function postExternalForm<T>(
  url: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { method: 'POST', body: form, signal });
  if (!response.ok) throw new Error(`Kho ảnh từ chối tệp (mã ${response.status}).`);
  return (await response.json()) as T;
}

/** Hinh dang tra ve cua moi duong dan liet ke, khop Page<T> ben may chu. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
