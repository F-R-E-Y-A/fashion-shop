import type { ProductSort } from '../api/index.js';
import styles from './SortSelect.module.css';

export function SortSelect({
  value,
  onChange,
  withRelevance = false,
}: {
  value: ProductSort;
  onChange: (value: ProductSort) => void;
  /** Them "Liên quan nhất"; chi co nghia khi dang co cau tim. */
  withRelevance?: boolean;
}) {
  return (
    <div className={styles.control}>
      <span className={styles.caption} aria-hidden="true">
        SẮP XẾP THEO
      </span>
      <span className={styles.field}>
        <select
          aria-label="Sắp xếp"
          value={value}
          onChange={(event) => onChange(event.target.value as ProductSort)}
        >
          {withRelevance && <option value="relevance">Liên quan nhất</option>}
          <option value="newest">Mới nhất</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
