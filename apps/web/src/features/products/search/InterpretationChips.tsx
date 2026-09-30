import type { SearchInterpretation } from '../api/index.js';
import type { ActiveFilter } from '../filters/active-filters.js';
import { type CatalogParams, patchCatalogParams } from '../lib/catalog-params.js';
import { removeTokens } from '../lib/remove-tokens.js';
import styles from './InterpretationChips.module.css';

/**
 * Hai dong chip: "Da hieu" (cac y may chu doc ra tu cau tim; bo mot chip la xoa dung nhung chu
 * da sinh ra no) va "Bo loc" (tham so tuong minh). Chip mau co cham mau.
 */
export function InterpretationChips({
  interpretation,
  filters,
  params,
  colorHex,
  onChange,
  onClearAll,
}: {
  interpretation: SearchInterpretation | undefined;
  filters: ActiveFilter[];
  params: CatalogParams;
  /** Ma mau theo ho mau, lay tu facets. */
  colorHex: (family: string) => string | undefined;
  onChange: (next: CatalogParams) => void;
  onClearAll: () => void;
}) {
  const chips = interpretation?.chips ?? [];
  if (chips.length === 0 && filters.length === 0) return null;
  return (
    <div className={styles.row}>
      {chips.length > 0 && <span className={styles.label}>Đã hiểu</span>}
      {chips.map((chip) => (
        <span key={`${chip.kind}-${chip.value}-${chip.tokens.join('.')}`} className={styles.chip}>
          {chip.kind === 'color' && (
            <i className={styles.dot} style={{ background: colorHex(chip.value) }} />
          )}
          {chip.label}
          <button
            type="button"
            aria-label={`Bỏ ${chip.label}`}
            onClick={() =>
              onChange(patchCatalogParams(params, { q: removeTokens(params.q, chip.tokens) }))
            }
          >
            ×
          </button>
        </span>
      ))}
      {filters.length > 0 && <span className={styles.label}>Bộ lọc</span>}
      {filters.map((filter) => (
        <span key={filter.key} className={styles.chip}>
          {filter.label}
          <button
            type="button"
            aria-label={`Bỏ ${filter.label}`}
            onClick={() => onChange(filter.next)}
          >
            ×
          </button>
        </span>
      ))}
      <button type="button" className={styles.clear} onClick={onClearAll}>
        Xoá tất cả
      </button>
    </div>
  );
}
