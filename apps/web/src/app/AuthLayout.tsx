import { Link, Outlet } from 'react-router-dom';

import { STORE_NAME, STORE_TAGLINE } from '@/core';

import styles from './AuthLayout.module.css';

/** Dung chung asset voi header/footer (ban ivory tren nen espresso): xem StoreLayout ve viewBox cat theo manifest. */
const WORDMARK_IVORY = {
  src: '/images/brand/freya/wordmark-ivory.png',
  viewBox: '58 177 2031 351',
};
const SYMBOL_IVORY = { src: '/images/brand/freya/symbol-ivory.png', viewBox: '212 129 879 995' };

/**
 * Khung rieng cho cac trang xac thuc cong khai (login, dang ky, OTP, quen/dat lai mat khau).
 * Khac StoreLayout: khong co menu danh muc hay footer cua hang — nguoi den day chi lam mot viec.
 * Ben trai la thuong hieu (art-direction "Gio Ho Phach"), ben phai la form; man hinh hep chi con form.
 */
export function AuthLayout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.panel}>
        <Link className={styles.brandLink} to="/" aria-label={`${STORE_NAME} — Trang chủ`}>
          <svg className={styles.brandSymbol} viewBox={SYMBOL_IVORY.viewBox} focusable="false">
            <image href={SYMBOL_IVORY.src} width={1254} height={1254} />
          </svg>
          <svg className={styles.wordmark} viewBox={WORDMARK_IVORY.viewBox} focusable="false">
            <image href={WORDMARK_IVORY.src} width={2172} height={724} />
          </svg>
        </Link>
        <div className={styles.message}>
          <p className={styles.slogan}>{STORE_TAGLINE}</p>
          <p className={styles.sub}>
            Đăng nhập để đồng bộ giỏ hàng, lưu địa chỉ và theo dõi đơn của bạn.
          </p>
        </div>
        <ul className={styles.perks}>
          <li>Miễn phí vận chuyển cho đơn từ 500.000₫</li>
          <li>Đổi trả trong 30 ngày</li>
          <li>Thanh toán khi nhận hàng toàn quốc</li>
        </ul>
      </aside>
      <main className={styles.formSide}>
        <Link className={styles.mobileBrand} to="/" aria-label={`${STORE_NAME} — Trang chủ`}>
          <img src={WORDMARK_IVORY.src} alt={STORE_NAME} />
        </Link>
        <Outlet />
      </main>
    </div>
  );
}
