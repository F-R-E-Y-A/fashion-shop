import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { STORE_NAME, STORE_TAGLINE } from '@/core';
import { useAuth } from '@/features/account';
import { cartKeys, getCart } from '@/features/cart';
import { CategoryMenu, SearchTrigger } from '@/features/products';

import styles from './StoreLayout.module.css';
import { useHeaderState } from './useHeaderState.js';

/** Cua gio hang tren khung: so mon doc tu cache dung chung voi trang /gio-hang. */
function CartLink() {
  const { data: cart } = useQuery({ queryKey: cartKeys.current(), queryFn: getCart });
  const count = cart?.itemCount ?? 0;

  return (
    <NavLink
      to="/gio-hang"
      className={styles.cart}
      aria-label={count > 0 ? `Giỏ hàng, ${count} món` : 'Giỏ hàng'}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M6.2 7.5h11.6l-1.2 11.7a1.7 1.7 0 0 1-1.7 1.5H9.1a1.7 1.7 0 0 1-1.7-1.5L6.2 7.5Z" />
        <path d="M9 9.5V6a3 3 0 0 1 6 0v3.5" />
      </svg>
      {count > 0 && <span className={styles.cartCount}>{count}</span>}
    </NavLink>
  );
}

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
          <CartLink />
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
          <p>{STORE_TAGLINE}</p>
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
