import { useQueries } from '@tanstack/react-query';

import { listProducts, type Product, productKeys } from '../api/index.js';

export interface SearchCard {
  /** So san pham khop dung ca cau; bang 0 khi may chu phai noi truy van (khong khop du moi y). */
  total: number;
  /** Cac san pham dau; rong khi phai noi truy van, de the khong khoe san pham khong dung y. */
  items: Product[];
  failed: boolean;
}

/**
 * Cac the tren trang chu la cau tim dung san (dip mac, chat lieu). Goi voi log=false de khong lam
 * lech nhat ky tim kiem cua khach. Moi the tu co ket qua: the loi khong keo theo the khac.
 */
export function useSearchCards(queries: readonly string[], pageSize: number) {
  const results = useQueries({
    queries: queries.map((search) => {
      const params = { search, pageSize, log: false };
      return { queryKey: productKeys.list(params), queryFn: () => listProducts(params) };
    }),
  });
  const cards: SearchCard[] = results.map((result) => {
    const relaxed = (result.data?.relaxed?.length ?? 0) > 0;
    return {
      total: relaxed ? 0 : (result.data?.total ?? 0),
      items: relaxed ? [] : (result.data?.items ?? []),
      failed: result.isError,
    };
  });
  return {
    cards,
    isPending: results.some((result) => result.isPending),
    allFailed: results.length > 0 && results.every((result) => result.isError),
  };
}
