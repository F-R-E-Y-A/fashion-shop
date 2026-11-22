import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import styles from './AccountPages.module.css';

export function AccountLayout() {
  const tabsRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const active = tabsRef.current?.querySelector('a[aria-current="page"]');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [pathname]);

  return (
    <section className={styles.container}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>TÀI KHOẢN</p>
        <h1>Thông tin của bạn</h1>
        <p>Quản lý hồ sơ, địa chỉ giao hàng và đơn đã đặt.</p>
      </header>
      <nav ref={tabsRef} className={styles.tabs} aria-label="Tài khoản">
        <NavLink to="ho-so" className={({ isActive }) => (isActive ? styles.active : '')}>
          Hồ sơ cá nhân
        </NavLink>
        <NavLink to="dia-chi" className={({ isActive }) => (isActive ? styles.active : '')}>
          Sổ địa chỉ
        </NavLink>
        <NavLink to="don-hang" className={({ isActive }) => (isActive ? styles.active : '')}>
          Đơn hàng
        </NavLink>
        <NavLink to="danh-gia" className={({ isActive }) => (isActive ? styles.active : '')}>
          Đánh giá
        </NavLink>
        <NavLink to="tra-hang" className={({ isActive }) => (isActive ? styles.active : '')}>
          Trả hàng
        </NavLink>
        <NavLink to="doi-mat-khau" className={({ isActive }) => (isActive ? styles.active : '')}>
          Đổi mật khẩu
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
