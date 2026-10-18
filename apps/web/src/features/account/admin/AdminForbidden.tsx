import { Link } from 'react-router-dom';

import styles from './AdminGate.module.css';

/**
 * Khong du quyen quan tri. `standalone` la trang rieng cua cong (chua dung khung quan tri);
 * con lai la khoi trong trang khi may chu tra 403 giua phien (vai ADMIN vua bi go).
 */
export function AdminForbidden({ standalone = false }: { standalone?: boolean }) {
  const content = (
    <section className={styles.panel} aria-labelledby="admin-forbidden-title">
      <p className={styles.eyebrow}>Quản trị</p>
      <h1 id="admin-forbidden-title" className={styles.title}>
        Không đủ quyền truy cập
      </h1>
      <p className={styles.text}>
        Tài khoản đang đăng nhập không có quyền quản trị. Nếu bạn cần quyền này, hãy liên hệ quản
        trị viên của cửa hàng.
      </p>
      <Link className={styles.action} to="/">
        Về cửa hàng
      </Link>
    </section>
  );
  return standalone ? <main className={styles.gate}>{content}</main> : content;
}
