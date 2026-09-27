import type { ProductSort } from '../api/index.js';

export function SortSelect({
  value,
  onChange,
}: {
  value: ProductSort;
  onChange: (value: ProductSort) => void;
}) {
  return (
    <label>
      <span className="sr-only">Sắp xếp</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ProductSort)}>
        <option value="newest">Mới nhất</option>
        <option value="price_asc">Giá tăng dần</option>
        <option value="price_desc">Giá giảm dần</option>
      </select>
    </label>
  );
}
