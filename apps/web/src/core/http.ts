/**
 * MOT cho duy nhat goi ra may chu. Khong feature nao duoc tu goi fetch.
 *
 * Ban 0.2 viet tay cho gon. Khi dac ta API on dinh se thay bang thu vien goi sinh tu
 * /api/docs-json, luc do kieu du lieu khop may chu tu dong (docs/TECH_DEBT.md muc ND-02).
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

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
  method?: 'GET' | 'POST';
  body?: unknown;
  accessToken?: string;
  credentials?: RequestCredentials;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: options.credentials,
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
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

export async function apiGet<T>(path: string, params?: QueryParams): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const search = query.toString();
  return apiRequest<T>(search ? `${path}?${search}` : path);
}

/** Hinh dang tra ve cua moi duong dan liet ke, khop Page<T> ben may chu. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
