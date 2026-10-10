import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { STORE_NAME, STORE_TAGLINE } from '@/core';
import { useAuth } from '@/features/account';
import { cartKeys, getCart } from '@/features/cart';
import { CategoryMenu, SearchTrigger } from '@/features/products';

import styles from './StoreLayout.module.css';
import { useHeaderState } from './useHeaderState.js';

/**
 * Nhan dien F.R.E.Y.A. dang raster PNG (work/branding/freya-brand-kit-v1). Canvas co margin lon
 * nen hien qua SVG viewBox dung vung co mau cua tung ban (asset-manifest.json: rasterLogoViewBox),
 * khong keo gian ti le. Header dung symbol + wordmark nam ngang, CUNG variant theo overHero:
 * ivory cho header trong suot tren hero, espresso cho header dac mau nen sang.
 */
const WORDMARK = {
  espresso: { src: '/images/brand/freya/wordmark-espresso.png', viewBox: '57 178 2031 349' },
  ivory: { src: '/images/brand/freya/wordmark-ivory.png', viewBox: '58 177 2031 351' },
} as const;

const SYMBOL = {
  espresso: { src: '/images/brand/freya/symbol-espresso.png', viewBox: '212 129 879 995' },
  ivory: { src: '/images/brand/freya/symbol-ivory.png', viewBox: '212 129 878 994' },
} as const;

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
        <Link className={styles.brand} to="/" aria-label={`${STORE_NAME} — Trang chủ`}>
          <svg
            className={styles.brandSymbol}
            viewBox={SYMBOL[overHero ? 'ivory' : 'espresso'].viewBox}
            aria-hidden="true"
            focusable="false"
          >
            <image href={SYMBOL[overHero ? 'ivory' : 'espresso'].src} width={1254} height={1254} />
          </svg>
          <svg
            className={styles.wordmark}
            viewBox={WORDMARK[overHero ? 'ivory' : 'espresso'].viewBox}
            aria-hidden="true"
            focusable="false"
          >
            <image href={WORDMARK[overHero ? 'ivory' : 'espresso'].src} width={2172} height={724} />
          </svg>
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
          {/* Cum nhan dien gom logo day du ban sang (SVG viewBox cat theo manifest) va khau hieu text,
              cung can giua theo mot truc cua wrapper; wrapper can trai trong cot footer. */}
          <div className={styles.footerBrand}>
            <svg
              className={styles.footerLogo}
              viewBox="152 103 1047 937"
              role="img"
              aria-label={STORE_NAME}
            >
              <image href="/images/brand/freya/logo-stacked-ivory.png" width={1360} height={1157} />
            </svg>
            <p className={styles.slogan}>{STORE_TAGLINE}</p>
          </div>
        </div>
        <div>
          <p>DANH MỤC</p>
          <CategoryMenu />
        </div>
        <small>
          © {new Date().getFullYear()} {STORE_NAME} · <Link to="/quan-tri">Quản trị</Link>
        </small>
      </footer>
    </div>
  );
}
