import type { AdminUser } from './admin-users.api.js';

/**
 * MOT codec cho dieu kien danh sach nguoi dung: doc URL, ghi URL, tham so API va query key deu di qua
 * day, nen ba noi khong the lech nhau. Gia tri sai hay la bi bo (ve mac dinh), khong bao gio den API.
 */
export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'PENDING_VERIFICATION', 'DISABLED'] as const;
export const USER_ROLES = ['ADMIN', 'CUSTOMER'] as const;
export const USER_SORTS = ['newest', 'oldest', 'email_asc', 'email_desc'] as const;
export const USER_PAGE_SIZES = [10, 20, 50] as const;

export type UserStatusFilter = (typeof USER_STATUSES)[number];
export type UserRoleFilter = (typeof USER_ROLES)[number];
export type UserSort = (typeof USER_SORTS)[number];
export type UserPageSize = (typeof USER_PAGE_SIZES)[number];

/** Bang gioi han cua API (do dai toi da cua email). */
export const USER_QUERY_MAX = 254;

/**
 * Trang lon nhat nhan tu URL. Lon hon nua thi offset vuot xa so tai khoan co the co va tien toi
 * gioi han so nguyen an toan cua JS, nen coi nhu URL sai.
 */
export const MAX_PAGE_PARAM = 100_000;

export interface UserListQuery {
  q: string;
  status: UserStatusFilter | null;
  role: UserRoleFilter | null;
  verified: boolean | null;
  sort: UserSort;
  page: number;
  pageSize: UserPageSize;
}

export const DEFAULT_USER_LIST_QUERY: UserListQuery = {
  q: '',
  status: null,
  role: null,
  verified: null,
  sort: 'newest',
  page: 1,
  pageSize: 20,
};

/** `null` la khong co tham so (trang 1); `undefined` la tham so sai, phai chuan hoa ve trang 1. */
export function parsePageParam(raw: string | null): number | null | undefined {
  if (raw === null) return null;
  if (!/^[1-9]\d{0,5}$/u.test(raw)) return undefined;
  const page = Number(raw);
  return page <= MAX_PAGE_PARAM ? page : undefined;
}

/** Trim, cat o 254 ky tu nhu API, trim lai (cat co the de lai khoang trang o cuoi). */
export function normalizeUserQueryText(raw: string): string {
  return raw.trim().slice(0, USER_QUERY_MAX).trim();
}

const oneOf = <T extends string>(values: readonly T[], raw: string | undefined): T | null =>
  raw !== undefined && (values as readonly string[]).includes(raw) ? (raw as T) : null;

/**
 * Doc URL. Tham so lap lai (?status=A&status=B) hay sai dang thi coi nhu vang; tham so la bi bo.
 * `canonical` la URL chuan hoa: khac URL dang mo thi trang thay URL bang `replace`.
 */
export function parseUserListSearch(search: string | URLSearchParams): {
  query: UserListQuery;
  canonical: string;
} {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const single = (name: string): string | undefined => {
    const values = params.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  };
  const verifiedRaw = single('verified');
  const pageSize = Number(single('pageSize'));
  const query: UserListQuery = {
    q: normalizeUserQueryText(single('q') ?? ''),
    status: oneOf(USER_STATUSES, single('status')),
    role: oneOf(USER_ROLES, single('role')),
    verified: verifiedRaw === 'true' ? true : verifiedRaw === 'false' ? false : null,
    sort: oneOf(USER_SORTS, single('sort')) ?? DEFAULT_USER_LIST_QUERY.sort,
    page: parsePageParam(single('page') ?? null) ?? 1,
    pageSize: (USER_PAGE_SIZES as readonly number[]).includes(pageSize)
      ? (pageSize as UserPageSize)
      : DEFAULT_USER_LIST_QUERY.pageSize,
  };
  return { query, canonical: serializeUserListQuery(query) };
}

/** URL chuan: thu tu co dinh, bo gia tri mac dinh. Tra '' hoac '?...'. */
export function serializeUserListQuery(query: UserListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.role) params.set('role', query.role);
  if (query.verified !== null) params.set('verified', String(query.verified));
  if (query.sort !== DEFAULT_USER_LIST_QUERY.sort) params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  if (query.pageSize !== DEFAULT_USER_LIST_QUERY.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const usersListPath = (query: Partial<UserListQuery> = {}): string =>
  `/admin/users${serializeUserListQuery({ ...DEFAULT_USER_LIST_QUERY, ...query })}`;

/** Moi dieu kien tru trang: hai key cung chu ky chi khac trang, placeholder moi duoc dung. */
export const userListSignature = (query: UserListQuery): string =>
  serializeUserListQuery({ ...query, page: 1 });

/** Tham so API: page va pageSize luon gui ro (API mac dinh 12); bo loc chi gui khi co. */
export function userListApiParams(query: UserListQuery): string {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.role) params.set('role', query.role);
  if (query.verified !== null) params.set('verified', String(query.verified));
  if (query.sort !== DEFAULT_USER_LIST_QUERY.sort) params.set('sort', query.sort);
  return params.toString();
}

export const hasUserListFilters = (query: UserListQuery): boolean =>
  query.q !== '' || query.status !== null || query.role !== null || query.verified !== null;

/**
 * Tai khoan con thuoc tap dang loc khong (doi chieu phia client, chi de bao "khong con khop" trong luc
 * cho API tai lai; membership, total va trang luon lay lai tu API).
 */
export function matchesUserListFilter(user: AdminUser, query: UserListQuery): boolean {
  if (query.q && !user.email.toLowerCase().includes(query.q.toLowerCase())) return false;
  if (query.status && user.status !== query.status) return false;
  if (query.role && !user.roles.includes(query.role)) return false;
  if (query.verified !== null && (user.emailVerifiedAt !== null) !== query.verified) return false;
  return true;
}

/** Ngu canh quay lai tu chi tiet: chuan hoa lai qua codec, khong mang chuoi la tu history state. */
export function readListReturn(state: unknown): string {
  const search =
    state && typeof state === 'object' ? (state as Record<string, unknown>).listSearch : undefined;
  if (typeof search !== 'string') return usersListPath();
  return `/admin/users${parseUserListSearch(search).canonical}`;
}
