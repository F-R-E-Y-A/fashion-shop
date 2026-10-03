import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { type CatalogParams, readCatalogParams, writeCatalogParams } from './catalog-params.js';

/**
 * Trang thai loc va sap xep nam tren duong dan: chia se duoc, nut quay lai cua trinh duyet giu dung.
 * `keepScroll` bao ScrollManager dung keo trang ve dau khi chi doi bo loc.
 */
export function useCatalogUrl(): readonly [CatalogParams, (next: CatalogParams) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => readCatalogParams(searchParams), [searchParams]);
  const update = useCallback(
    (next: CatalogParams) =>
      setSearchParams(writeCatalogParams(next), { state: { keepScroll: true } }),
    [setSearchParams],
  );
  return [params, update] as const;
}
