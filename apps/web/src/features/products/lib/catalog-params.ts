import type { Audience, ProductSort } from '../api/index.js';

/** Trang thai loc va sap xep cua trang tim kiem va trang danh muc, luu tren duong dan. */
export interface CatalogParams {
  q: string;
  audience: Audience | null;
  categories: string[];
  colors: string[];
  sizes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  /** null = mac dinh: lien quan nhat khi co cau tim, moi nhat khi khong. */
  sort: ProductSort | null;
  page: number;
}

export const emptyCatalogParams: CatalogParams = {
  q: '',
  audience: null,
  categories: [],
  colors: [],
  sizes: [],
  minPrice: null,
  maxPrice: null,
  sort: null,
  page: 1,
};

const SORTS: readonly ProductSort[] = ['relevance', 'newest', 'price_asc', 'price_desc'];
const MAX_QUERY = 120;
const MAX_LIST = 10;

const list = (raw: string | null, pattern: RegExp, upper = false): string[] => {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((v) => (upper ? v.trim().toUpperCase() : v.trim()))
    .filter((v) => pattern.test(v));
  return [...new Set(values)].slice(0, MAX_LIST);
};

const money = (raw: string | null): number | null => {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const value = Number(raw);
  return value <= 1_000_000_000 ? value : null;
};

/** Doc duong dan. Gia tri sai bi bo qua thay vi lam trang loi (nguoi dung co the sua tay URL). */
export function readCatalogParams(search: URLSearchParams): CatalogParams {
  const audience = search.get('audience');
  const sort = search.get('sort');
  const page = Number(search.get('page') ?? '1');
  return {
    q: (search.get('q') ?? '').trim().slice(0, MAX_QUERY),
    audience: audience === 'nam' || audience === 'nu' ? audience : null,
    categories: list(search.get('categories'), /^[a-z0-9-]{1,140}$/),
    colors: list(search.get('colors'), /^[a-z-]{1,20}$/),
    sizes: list(search.get('sizes'), /^[A-Z0-9]{1,6}$/, true),
    minPrice: money(search.get('minPrice')),
    maxPrice: money(search.get('maxPrice')),
    sort: SORTS.includes(sort as ProductSort) ? (sort as ProductSort) : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Ghi duong dan. Khong ghi gia tri mac dinh de URL ngan va de chia se. */
export function writeCatalogParams(params: CatalogParams): URLSearchParams {
  const out = new URLSearchParams();
  if (params.q) out.set('q', params.q);
  if (params.audience) out.set('audience', params.audience);
  if (params.categories.length) out.set('categories', params.categories.join(','));
  if (params.colors.length) out.set('colors', params.colors.join(','));
  if (params.sizes.length) out.set('sizes', params.sizes.join(','));
  if (params.minPrice !== null) out.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== null) out.set('maxPrice', String(params.maxPrice));
  if (params.sort) out.set('sort', params.sort);
  if (params.page > 1) out.set('page', String(params.page));
  return out;
}

/** Doi bo loc hay cau thi ve trang 1; muon giu trang thi truyen `page` trong `patch`. */
export function patchCatalogParams(
  current: CatalogParams,
  patch: Partial<CatalogParams>,
): CatalogParams {
  return { ...current, page: 1, ...patch };
}

/** So bo loc tuong minh dang bat (khong tinh cau tim); khoang gia tinh la mot. */
export function countActiveFilters(params: CatalogParams): number {
  return (
    (params.audience ? 1 : 0) +
    params.categories.length +
    params.colors.length +
    params.sizes.length +
    (params.minPrice !== null || params.maxPrice !== null ? 1 : 0)
  );
}
