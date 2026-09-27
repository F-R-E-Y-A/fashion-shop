import { Link } from 'react-router-dom';

import styles from './Catalog.module.css';

export function HeroSection() {
  return (
    <section className={styles.hero} aria-label="Bộ sưu tập mới">
      <div className={styles.heroContent}>
        <p className={styles.eyebrow}>THỜI TRANG LÀ CÁCH BẠN KỂ CÂU CHUYỆN</p>
        <h1>MẶC CHẤT RIÊNG</h1>
        <p>Tinh tế trong từng lựa chọn. Tự tin theo cách của bạn.</p>
        <Link to="/san-pham" className={styles.outlineButton}>
          KHÁM PHÁ BỘ SƯU TẬP →
        </Link>
      </div>
    </section>
  );
}
