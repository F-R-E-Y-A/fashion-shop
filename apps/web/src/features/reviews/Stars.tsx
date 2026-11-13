import { RATING_LABELS } from './reviews.api.js';
import styles from './Reviews.module.css';

export function formatRating(value: number): string {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Sao hien thi, to phan le (4,3 sao to 86%). Doc man hinh doc mot cau, khong doc tung ky tu. */
export function Stars({
  value,
  size = 'md',
  label,
}: {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const percent = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span
      className={styles.stars}
      data-size={size}
      role="img"
      aria-label={label ?? `${formatRating(value)} trên 5 sao`}
    >
      <span aria-hidden="true">★★★★★</span>
      <span className={styles.starsFill} style={{ width: `${percent}%` }} aria-hidden="true">
        ★★★★★
      </span>
    </span>
  );
}

/** Dong gon cho the san pham va dau trang chi tiet; chua co danh gia thi khong hien gi. */
export function RatingBadge({ average, count }: { average?: number; count?: number }) {
  if (!count || !average) return null;
  return (
    <span className={styles.badge}>
      <Stars value={average} size="sm" />
      <span>
        {formatRating(average)} <span className={styles.badgeCount}>({count})</span>
      </span>
    </span>
  );
}

/** Chon so sao bang nut radio that: ban phim (mui ten) va trinh doc man hinh dung san. */
export function StarInput({
  name,
  value,
  onChange,
  legend = 'Chất lượng sản phẩm',
}: {
  name: string;
  value: number;
  onChange(value: number): void;
  legend?: string;
}) {
  return (
    <fieldset className={styles.starInput}>
      <legend>{legend}</legend>
      <span className={styles.starChoices}>
        {[1, 2, 3, 4, 5].map((star) => (
          <label key={star} data-on={star <= value || undefined}>
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
            />
            <span aria-hidden="true">★</span>
            <span className="sr-only">
              {star} sao, {RATING_LABELS[star]}
            </span>
          </label>
        ))}
      </span>
      <span className={styles.starLabel} aria-live="polite">
        {value ? RATING_LABELS[value] : 'Chọn số sao'}
      </span>
    </fieldset>
  );
}
