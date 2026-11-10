export const CATALOG_STATUSES = ['all', 'active', 'inactive'] as const;
export const CATALOG_SORTS = ['newest', 'name_asc'] as const;
export interface CatalogQuery {
  q: string;
  status: (typeof CATALOG_STATUSES)[number];
  sort: (typeof CATALOG_SORTS)[number];
  page: number;
  pageSize: number;
}
export function parseCatalogQuery(search: string): CatalogQuery {
  const params = new URLSearchParams(search);
  const single = (key: string) => (params.getAll(key).length === 1 ? params.get(key)! : '');
  const positive = (key: string, fallback: number, max: number) => {
    const raw = single(key);
    const value = /^[1-9]\d*$/.test(raw) ? Number(raw) : NaN;
    return Number.isSafeInteger(value) && value <= max ? value : fallback;
  };
  const status = single('status');
  const sort = single('sort');
  return {
    q: single('q').trim().slice(0, 120).trim(),
    status: status === 'active' || status === 'inactive' ? status : 'all',
    sort: sort === 'name_asc' ? sort : 'newest',
    page: positive('page', 1, 100000),
    pageSize: positive('pageSize', 12, 60),
  };
}
export function catalogSearch(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status !== 'all') params.set('status', query.status);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (query.pageSize !== 12) params.set('pageSize', String(query.pageSize));
  if (query.page !== 1) params.set('page', String(query.page));
  return params.size ? `?${params}` : '';
}
export const catalogListPath = (query: CatalogQuery) => `/admin/products${catalogSearch(query)}`;
