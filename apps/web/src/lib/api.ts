/**
 * Mot cho duy nhat goi ra may chu.
 *
 * Ban 0.1 viet tay cho gon. O ban sau se thay bang thu vien goi sinh tu dac ta
 * OpenAPI tai /api/docs-json, luc do kieu du lieu se khop may chu mot cach tu dong
 * va khong ai phai go lai kieu bang tay nua.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

/** Hinh dang loi thong nhat, khop voi AllExceptionsFilter ben may chu. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    const text = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    super(text);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });

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

  return (await response.json()) as T;
}

/** Kieu du lieu san pham, khop ProductResponse ben may chu. */
export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  categoryName: string;
  categorySlug: string;
}

export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const formatPrice = (value: string): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));
