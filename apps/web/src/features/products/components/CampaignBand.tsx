import { Link } from 'react-router-dom';

import styles from './Catalog.module.css';

export function CampaignBand() {
  return (
    <section className={styles.campaign} aria-label="Chiến dịch thời trang">
      <div>
        <p className={styles.eyebrow}>TINH TẾ. HIỆN ĐẠI. VƯỢT THỜI GIAN.</p>
        <h2>
          THỜI TRANG
          <br />
          CHO NHỮNG NGƯỜI
          <br />
          DÁM KHÁC BIỆT
        </h2>
        <Link to="/san-pham" className={styles.darkButton}>
          KHÁM PHÁ →
        </Link>
      </div>
    </section>
  );
}
