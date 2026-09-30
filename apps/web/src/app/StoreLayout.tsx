import { Link, NavLink, Outlet } from 'react-router-dom';

import { STORE_NAME } from '@/core';
import { useAuth } from '@/features/account';
import { CategoryMenu, SearchTrigger } from '@/features/products';

import styles from './StoreLayout.module.css';
import { useHeaderState } from './useHeaderState.js';

export function StoreLayout() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { headerRef, isHome, overHero } = useHeaderState();

  return (
    <div className={styles.shell}>
      <header
        ref={headerRef}
        className={styles.header}
        data-home={isHome}
        data-over-hero={overHero}
      >
        <Link className={styles.brand} to="/">
          {STORE_NAME}
        </Link>
        <div className={styles.menu}>
          <CategoryMenu />
        </div>
        <div className={styles.actions}>
          <SearchTrigger />
          <div className={styles.account} aria-live="polite">
            {isLoading && <span className={styles.accountStatus}>Đang khôi phục phiên…</span>}
            {!isLoading && !isAuthenticated && (
              <>
                <NavLink to="/login">Đăng nhập</NavLink>
                <NavLink to="/register">Đăng ký</NavLink>
              </>
            )}
            {!isLoading && isAuthenticated && (
              <>
                <span className={styles.accountStatus}>{user?.email}</span>
                <NavLink to="/doi-mat-khau">Đổi mật khẩu</NavLink>
                <button type="button" className={styles.logout} onClick={() => void logout()}>
                  Đăng xuất
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div>
          <Link className={styles.brand} to="/">
            {STORE_NAME}
          </Link>
          <p>Phong cách là tự do.</p>
        </div>
        <div>
          <p>DANH MỤC</p>
          <CategoryMenu />
        </div>
        <small>
          © {new Date().getFullYear()} Thời Trang · <Link to="/quan-tri">Quản trị</Link>
        </small>
      </footer>
    </div>
  );
}
