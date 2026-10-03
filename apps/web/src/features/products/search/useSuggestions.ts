import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { productKeys, suggest } from '../api/index.js';
import { MIN_QUERY_LENGTH, SUGGEST_DELAY_MS } from './search-content.js';

/**
 * Goi y cho o tim kiem: cho SUGGEST_DELAY_MS sau lan go cuoi moi goi API, chi khi du do dai,
 * huy yeu cau cu (signal) va giu ket qua cu tren man hinh trong luc cho ket qua moi.
 * Khong tu thu lai: may chu gioi han 60 lan moi phut, thu lai chi tao them 429.
 */
export function useSuggestions(text: string) {
  const trimmed = text.trim();
  const [settled, setSettled] = useState(trimmed);

  useEffect(() => {
    if (trimmed === settled) return;
    const timer = window.setTimeout(() => setSettled(trimmed), SUGGEST_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, settled]);

  const enabled = settled.length >= MIN_QUERY_LENGTH;
  const query = useQuery({
    queryKey: productKeys.suggest(settled),
    queryFn: ({ signal }) => suggest(settled, signal),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });

  return {
    data: enabled ? query.data : undefined,
    isError: enabled && query.isError,
    /** Dang cho ngung go hoac dang cho may chu: hien thanh tien trinh. */
    isWaiting: trimmed !== settled || (enabled && query.isFetching),
  };
}
