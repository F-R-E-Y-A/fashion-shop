import { ApiError } from './http.js';

/**
 * Nhom loi cua mot yeu cau toi API, de man hinh chon cau bao co dinh thay vi in message tho
 * (LOG#adr-039). Moi nhom mot cach xu ly:
 * - forbidden: may chu noi khong con quyen (vd mat vai ADMIN giua chung);
 * - unknown: POST da gui nhung khong biet may chu co thuc hien chua (het gio, mat mang, 5xx);
 * - unavailable: GET khong doc duoc (5xx, mat mang), thu lai duoc.
 * Loi rieng cua feature (vd doi phien) thi feature kiem truoc roi moi goi ham nay.
 */
export type RequestErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'invalid'
  | 'conflict'
  | 'rejected'
  | 'unknown'
  | 'unavailable';

export type RequestTarget = 'list' | 'detail' | 'mutation';

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

export function classifyRequestError(error: unknown, target: RequestTarget): RequestErrorKind {
  if (error instanceof ApiError) {
    const status = error.body.statusCode;
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'forbidden';
    if (status === 404) return 'not-found';
    // Id sai dang UUID tra 400: voi chi tiet, nguoi dung chi can biet "khong tim thay".
    if (status === 400) return target === 'list' ? 'invalid' : 'not-found';
    if (status === 409) return 'conflict';
    if (status >= 400 && status < 500) return 'rejected';
    // 5xx sau mot POST (502/504 qua proxy) khong chung minh may chu chua ghi.
    return target === 'mutation' ? 'unknown' : 'unavailable';
  }
  return target === 'mutation' ? 'unknown' : 'unavailable';
}

/** Query chi thu lai mot lan voi loi tam thoi (5xx, mang); khong bao gio voi 4xx hay bi huy. */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  if (isAbortLike(error)) return false;
  if (error instanceof ApiError && error.body.statusCode < 500) return false;
  return failureCount < 1;
}

export function requestErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.body.code : undefined;
}
