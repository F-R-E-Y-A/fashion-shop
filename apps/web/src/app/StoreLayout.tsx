import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { STORE_NAME, STORE_TAGLINE } from '@/core';
import { hasAdminRole, useAuth } from '@/features/account';
import { cartKeys, getCart } from '@/features/cart';
import { NotificationBell } from '@/features/notifications';
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

/** Hai chu cai dau email lam anh dai dien mac dinh; sau nay thay bang anh avatar that cung khung nay. */
function initialsOf(email: string): string {
  const local = email.split('@')[0] ?? '';
  const letters = local
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase();
  return letters || '?';
}

/**
 * Menu tai khoan dang avatar (chu van): click mo bang chon, click ngoai hoac ESC dong,
 * chuyen trang tu dong dong. So dia chi khong nam day — no la tab con cua /tai-khoan.
 */
function AccountMenu({
  email,
  isAdmin,
  onLogout,
}: {
  email: string;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Chuyen trang tu dong dong menu khong can effect rieng: moi duong dan khac deu nam ngoai
  // cum avatar nen pointerdown-outside o tren da dong; rieng link trong menu tu dong dong qua onClick.

  const close = () => setOpen(false);
  const initials = initialsOf(email);

  return (
    <div className={styles.accountMenu} ref={rootRef}>
      <button
        type="button"
        className={styles.accountButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${email || 'của bạn'}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials}
          <i className={styles.presenceDot} />
        </span>
        <span className={styles.chevron} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className={styles.accountDropdown} aria-label="Menu tài khoản">
          <div className={styles.menuHeader}>
            <span className={styles.menuAvatar} aria-hidden="true">
              {initials}
            </span>
            <span className={styles.menuEmail} title={email}>
              {email}
            </span>
          </div>
          <NavLink className={styles.menuLink} to="/tai-khoan/ho-so" onClick={close}>
            Hồ sơ cá nhân
          </NavLink>
          <NavLink className={styles.menuLink} to="/tai-khoan/don-hang" onClick={close}>
            Đơn hàng của tôi
          </NavLink>
          <NavLink className={styles.menuLink} to="/tai-khoan/doi-mat-khau" onClick={close}>
            Đổi mật khẩu
          </NavLink>
          {/* Chi la loi tat cho ADMIN; quyen that nam o RequireAdmin va RolesGuard may chu. */}
          {isAdmin && (
            <NavLink className={styles.menuLink} to="/admin" onClick={close}>
              Quản trị
            </NavLink>
          )}
          <div className={styles.menuSeparator} />
          <button
            type="button"
            className={`${styles.menuLink} ${styles.menuLogout}`}
            onClick={onLogout}
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

export function StoreLayout() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();
  const { headerRef, isHome, overHero } = useHeaderState();
  const isAdmin = hasAdminRole(user);

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
          {isAuthenticated && <NotificationBell autoFetch />}
          <CartLink />
          <div className={styles.account} aria-live="polite">
            {isLoading && <span className={styles.accountStatus}>Đang khôi phục phiên…</span>}
            {!isLoading && !isAuthenticated && (
              <>
                <NavLink to="/login" className={styles.loginLink}>
                  Đăng nhập
                </NavLink>
                <NavLink to="/register" className={styles.registerBtn}>
                  Đăng ký
                </NavLink>
              </>
            )}
            {!isLoading && isAuthenticated && (
              <AccountMenu
                email={user?.email ?? ''}
                isAdmin={isAdmin}
                onLogout={() => void logout()}
              />
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
          © {new Date().getFullYear()} {STORE_NAME}
          {isAdmin && (
            <>
              {' · '}
              <Link to="/admin">Quản trị</Link>
            </>
          )}
        </small>
      </footer>
    </div>
  );
}
