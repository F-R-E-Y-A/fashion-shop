import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { STORE_NAME, STORE_TAGLINE } from '@/core';
import { useAuth } from '@/features/account';
import { NotificationBell } from '@/features/notifications';
import { AdminIcon } from '@/ui';

import styles from './AdminLayout.module.css';
import { AdminBrand, AdminDrawer, AdminNavigation } from './AdminNavigation.js';

/** RequireAdmin bọc ngoài layout; giữ toàn bộ kiểm quyền và request trong feature hiện có. */
export function AdminLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const section = pathname.startsWith('/admin/inventory')
    ? 'Tồn kho'
    : pathname.startsWith('/admin/categories')
      ? 'Danh mục'
      : pathname.startsWith('/admin/users')
        ? 'Người dùng'
        : pathname.startsWith('/admin/orders')
          ? 'Đơn hàng'
          : pathname.startsWith('/admin/products')
            ? 'Sản phẩm'
            : pathname.startsWith('/admin/promotions')
              ? 'Khuyến mãi'
              : pathname.startsWith('/admin/vouchers')
                ? 'Mã giảm giá'
                : pathname.startsWith('/admin/reviews')
                  ? 'Đánh giá'
                  : 'Tổng quan';
  useEffect(() => {
    window.addEventListener('popstate', closeMenu);
    return () => window.removeEventListener('popstate', closeMenu);
  }, [closeMenu]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 720px)');
    const onChange = () => {
      if (!media.matches) closeMenu();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [closeMenu]);
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#admin-content">
        Bỏ qua điều hướng
      </a>
      <aside className={styles.side}>
        <AdminBrand />
        <p className={styles.navLabel}>Quản lý cửa hàng</p>
        <AdminNavigation />
        <div className={styles.account}>
          <span>Quản trị viên</span>
          {user && <span className={styles.accountEmail}>{user.email}</span>}
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topbarStart}>
            <button
              ref={openerRef}
              type="button"
              className={`${styles.iconButton} ${styles.menuButton}`}
              aria-label="Mở điều hướng quản trị"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <AdminIcon name="menu" />
            </button>
            <nav className={styles.breadcrumb} aria-label="Vị trí hiện tại">
              <Link to="/admin">Quản trị</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{section}</span>
            </nav>
          </div>
          <div className={styles.topbarEnd}>
            <NotificationBell isAdmin autoFetch={false} />
            <Link className={styles.storeLink} to="/">
              Cửa hàng <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </header>
        <main ref={mainRef} id="admin-content" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
        <footer className={styles.footer}>
          <span>{STORE_NAME}</span>
          <span>{STORE_TAGLINE}</span>
        </footer>
      </div>
      {menuOpen && <AdminDrawer onClose={closeMenu} returnFocusRef={openerRef} mainRef={mainRef} />}
    </div>
  );
}
