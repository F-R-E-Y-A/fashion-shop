import { Link, NavLink, Outlet } from 'react-router-dom';

import { STORE_NAME } from '@/core';

import styles from './AdminLayout.module.css';

/** Ban ivory cua symbol tren nen Espresso; viewBox cat theo asset-manifest nhu AuthLayout. */
const SYMBOL_IVORY = { src: '/images/brand/freya/symbol-ivory.png', viewBox: '212 129 879 995' };

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

/**
 * Khung trang quan tri. Chi dung sau RequireAdmin (app/routes.tsx), nen khong tu kiem quyen.
 *
 * Moi nguoi tu lam man quan tri cua chinh nhung bang minh so huu, dat trong feature cua minh,
 * roi them mot NavLink o day. Chi them muc khi trang da chay that, khong ve muc cho san.
 */
export function AdminLayout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <Link className={styles.brand} to="/admin" aria-label={`${STORE_NAME} — Quản trị`}>
          <svg
            className={styles.symbol}
            viewBox={SYMBOL_IVORY.viewBox}
            aria-hidden="true"
            focusable="false"
          >
            <image href={SYMBOL_IVORY.src} width={1254} height={1254} />
          </svg>
          <span className={styles.brandText}>
            <span className={styles.brandName}>{STORE_NAME}</span>
            <span className={styles.brandRole}>Quản trị</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Điều hướng quản trị">
          <NavLink to="/admin" end className={navClass}>
            Tổng quan
          </NavLink>
          <NavLink to="/admin/users" className={navClass}>
            Người dùng
          </NavLink>
        </nav>
        <Link className={styles.store} to="/">
          ← Về cửa hàng
        </Link>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
