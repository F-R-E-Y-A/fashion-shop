import type { ReactNode, Ref } from 'react';

import styles from './FilteredResults.module.css';

/**
 * Nut mo tam bo loc tren dien thoai, ghi so bo loc dang bat. An tren man hinh rong, noi bo loc
 * da nam san trong cot ben trai.
 */
export function FilterToggle({
  count,
  expanded,
  controls,
  onClick,
  ref,
}: {
  count: number;
  expanded: boolean;
  controls: string;
  onClick: () => void;
  ref: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={styles.toggle}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      Lọc{count > 0 ? ` (${count})` : ''}
    </button>
  );
}

/**
 * Khung hai cot dung chung cho trang tim kiem va trang danh muc: cot loc ben trai (260 px),
 * ben phai la thanh sap xep va ket qua. Duoi 860 px xep mot cot.
 */
export function FilteredResults({
  panel,
  toggle,
  sort,
  children,
}: {
  panel: ReactNode;
  toggle: ReactNode;
  sort: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.body}>
      {panel}
      <section aria-label="Kết quả">
        <div className={styles.bar}>
          {toggle}
          {sort}
        </div>
        {children}
      </section>
    </div>
  );
}
