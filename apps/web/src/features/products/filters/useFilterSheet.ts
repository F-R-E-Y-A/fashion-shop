import { useCallback, useState, useSyncExternalStore } from 'react';

const SHEET_QUERY = '(max-width: 860px)';

function useIsSheetWidth(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(SHEET_QUERY);
      media?.addEventListener('change', onChange);
      return () => media?.removeEventListener('change', onChange);
    },
    () => window.matchMedia?.(SHEET_QUERY).matches ?? false,
    () => false,
  );
}

/**
 * Trang thai tam bo loc tren dien thoai. Tam chi co nghia khi man hinh du hep; man hinh rong thi bo
 * loc luon nam trong cot ben trai. Dong tam thi tra focus ve nut "Loc" da mo no.
 */
export function useFilterSheet() {
  const [requested, setRequested] = useState(false);
  const narrow = useIsSheetWidth();
  // Ref dang ham (state) de co the nhan focus khi dong tam ma khong doc ref luc render.
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null);

  const openSheet = useCallback(() => setRequested(true), []);
  const closeSheet = useCallback(() => {
    setRequested(false);
    toggle?.focus();
  }, [toggle]);

  return { sheetOpen: requested && narrow, openSheet, closeSheet, attachToggle: setToggle };
}
