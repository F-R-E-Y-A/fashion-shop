import type { ProductSort } from '../api/index.js';
import styles from './Catalog.module.css';

export function SortSelect({
  value,
  onChange,
}: {
  value: ProductSort;
  onChange: (value: ProductSort) => void;
}) {
  return (
    <div className={styles.sortControl}>
      <span className={styles.sortCaption} aria-hidden="true">
        SẮP XẾP THEO
      </span>
      <span className={styles.sortField}>
        <select
          aria-label="Sắp xếp"
          value={value}
          onChange={(event) => onChange(event.target.value as ProductSort)}
        >
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
