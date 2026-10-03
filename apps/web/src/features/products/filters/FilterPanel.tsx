import { useEffect, useRef } from 'react';

import type { CatalogFacets, SearchInterpretation } from '../api/index.js';
import type { CatalogParams } from '../lib/catalog-params.js';
import { FilterGroups } from './FilterGroups.js';
import styles from './FilterPanel.module.css';
import { toggleFacet } from './toggle-facet.js';

/**
 * Bo loc dung chung cho trang tim kiem va trang danh muc. May tinh (tren 860 px): cot dinh ben trai.
 * Dien thoai: tam toan man hinh, mo bang nut "Loc" cua trang; khi mo la hop thoai modal.
 */
export function FilterPanel({
  id,
  facets,
  interpretation,
  params,
  total,
  sheetOpen,
  onCloseSheet,
  onChange,
  onClear,
  showCategories = true,
}: {
  id: string;
  facets: CatalogFacets | undefined;
  interpretation: SearchInterpretation | undefined;
  params: CatalogParams;
  /** So san pham hien tai, ghi tren nut day tam. */
  total: number | undefined;
  sheetOpen: boolean;
  onCloseSheet: () => void;
  onChange: (next: CatalogParams) => void;
  onClear: () => void;
  showCategories?: boolean;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Tam mo: khoa cuon trang, dua focus vao nut dong, Esc dong.
  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onCloseSheet();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sheetOpen, onCloseSheet]);

  return (
    <aside
      id={id}
      className={`${styles.panel} ${sheetOpen ? styles.open : ''}`}
      aria-label="Bộ lọc"
      role={sheetOpen ? 'dialog' : undefined}
      aria-modal={sheetOpen ? true : undefined}
    >
      <div className={styles.head}>
        <h2>Bộ lọc</h2>
        <button
          ref={closeRef}
          type="button"
          className={styles.close}
          aria-label="Đóng bộ lọc"
          onClick={onCloseSheet}
        >
          ✕
        </button>
      </div>
      <FilterGroups
        facets={facets}
        params={params}
        interpretation={interpretation}
        showCategories={showCategories}
        onToggle={(dimension, value) =>
          onChange(toggleFacet(params, interpretation, dimension, value))
        }
      />
      <div className={styles.foot}>
        <button type="button" className={styles.clear} onClick={onClear}>
          Xoá lọc
        </button>
        <button type="button" className={styles.apply} onClick={onCloseSheet}>
          Xem {total ?? ''} sản phẩm
        </button>
      </div>
    </aside>
  );
}
