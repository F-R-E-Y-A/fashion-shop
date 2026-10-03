import styles from './CategoryMarquee.module.css';
import { MARQUEE_ITEMS } from './home-content.js';

/** Dai chu nghieng chay ngang. Ban lap lai chi de vong lap lien mach, an voi trinh doc man hinh. */
export function CategoryMarquee() {
  return (
    <div className={styles.marquee} aria-label="Các dòng hàng">
      <div className={styles.track}>
        {MARQUEE_ITEMS.map((item) => (
          <span key={item}>{item}</span>
        ))}
        {MARQUEE_ITEMS.map((item) => (
          <span key={`${item}-copy`} className={styles.copy} aria-hidden="true">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
