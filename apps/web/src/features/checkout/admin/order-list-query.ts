import { ORDER_TABS, type OrderTab } from './admin-orders.api.js';

export interface OrderListQuery {
  tab: OrderTab;
  q: string;
  page: number;
}
export const ORDER_QUERY_MAX = 254;
/** Gioi han dieu huong client, khong phai thay doi rang buoc API. */
const MAX_PAGE = 100_000;
export const normalizeOrderSearch = (text: string) => text.trim().slice(0, ORDER_QUERY_MAX).trim();

/** Mot codec cho URL, dieu kien query/request va duong ve tu chi tiet; khong nhan return URL. */
export function parseOrderListSearch(search: string): { query: OrderListQuery; canonical: string } {
  const params = new URLSearchParams(search);
  const single = (key: string) => {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  };
  const tab = ORDER_TABS.find((item) => item.key === single('tab'))?.key ?? 'attention';
  const rawPage = single('page') ?? '';
  const page = /^[1-9]\d{0,5}$/u.test(rawPage) && Number(rawPage) <= MAX_PAGE ? Number(rawPage) : 1;
  const query = { tab, q: normalizeOrderSearch(single('q') ?? ''), page };
  return { query, canonical: serializeOrderListQuery(query) };
}

export function serializeOrderListQuery(query: OrderListQuery): string {
  const params = new URLSearchParams();
  if (query.tab !== 'attention') params.set('tab', query.tab);
  if (query.q) params.set('q', query.q);
  if (query.page > 1) params.set('page', String(query.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}
export const orderListPath = (query: OrderListQuery) =>
  `/admin/orders${serializeOrderListQuery(query)}`;
