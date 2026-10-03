import type { CatalogFacets, FacetPrice, SearchInterpretation } from '../api/index.js';
import type { CatalogParams } from '../lib/catalog-params.js';
import styles from './FilterPanel.module.css';
import { type FacetDimension, isPriceSelected } from './toggle-facet.js';

const AUDIENCES = [
  { value: 'nu', label: 'Nữ' },
  { value: 'nam', label: 'Nam' },
] as const;

/** Cac nhom lua chon: doi tuong, danh muc, mau, co, gia. Moi lua chon kem so dem; an lua chon 0 tru khi dang chon. */
export function FilterGroups({
  facets,
  params,
  interpretation,
  showCategories,
  onToggle,
}: {
  facets: CatalogFacets | undefined;
  params: CatalogParams;
  interpretation: SearchInterpretation | undefined;
  showCategories: boolean;
  onToggle: (dimension: FacetDimension, value: string | FacetPrice) => void;
}) {
  if (!facets) return null;
  const askedAudience = params.audience ?? interpretation?.audience ?? null;
  const has = (list: string[], fromQuery: string[] | undefined, value: string) =>
    list.includes(value) || (fromQuery?.includes(value) ?? false);
  const priceChip =
    params.minPrice === null && params.maxPrice === null
      ? interpretation?.chips.find((chip) => chip.kind === 'price')
      : undefined;

  const colors = facets.colors.filter(
    (c) => c.count > 0 || has(params.colors, interpretation?.colorFamilies, c.family),
  );
  const sizes = facets.sizes.filter(
    (s) => s.count > 0 || has(params.sizes, interpretation?.sizes, s.code),
  );
  const prices = facets.price.filter((b) => b.count > 0 || isPriceSelected(params, b));
  const categories = facets.categories.filter(
    (c) => c.count > 0 || has(params.categories, interpretation?.categorySlugs, c.slug),
  );

  return (
    <>
      <div className={styles.group}>
        <h3>Đối tượng</h3>
        <div className={styles.segment}>
          {AUDIENCES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={styles.button}
              aria-pressed={askedAudience === value}
              onClick={() => onToggle('audience', value)}
            >
              {label}
              <span className={styles.count}>
                {facets.audience.find((a) => a.value === value)?.count ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showCategories && categories.length > 0 && (
        <div className={styles.group}>
          <h3>Danh mục</h3>
          <div>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                className={`${styles.button} ${styles.option} ${c.parentSlug ? styles.child : ''}`}
                aria-pressed={has(params.categories, interpretation?.categorySlugs, c.slug)}
                onClick={() => onToggle('category', c.slug)}
              >
                <span className={styles.label}>{c.name}</span>
                <span className={styles.count}>{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div className={styles.group}>
          <h3>Màu</h3>
          <div className={styles.swatchGrid}>
            {colors.map((c) => (
              <button
                key={c.family}
                type="button"
                className={`${styles.button} ${styles.swatch}`}
                aria-pressed={has(params.colors, interpretation?.colorFamilies, c.family)}
                onClick={() => onToggle('color', c.family)}
              >
                <i style={{ background: c.hex }} />
                {c.label}
                <span className={styles.count}>{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div className={styles.group}>
          <h3>Cỡ</h3>
          <div className={styles.sizeGrid}>
            {sizes.map((s) => (
              <button
                key={s.code}
                type="button"
                className={`${styles.button} ${styles.size}`}
                aria-pressed={has(params.sizes, interpretation?.sizes, s.code)}
                onClick={() => onToggle('size', s.code)}
              >
                {s.code}
                <span className={styles.count}>{s.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {prices.length > 0 && (
        <div className={styles.group}>
          <h3>Giá</h3>
          <div>
            {priceChip && <p className={styles.note}>Đang theo câu: {priceChip.label}</p>}
            {prices.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`${styles.button} ${styles.option} ${styles.radio}`}
                aria-pressed={isPriceSelected(params, b)}
                onClick={() => onToggle('price', b)}
              >
                <span className={styles.label}>{b.label}</span>
                <span className={styles.count}>{b.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
