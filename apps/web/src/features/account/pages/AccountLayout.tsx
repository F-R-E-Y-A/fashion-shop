import { NavLink, Outlet } from 'react-router-dom';

import styles from './AccountPages.module.css';

export function AccountLayout() {
  return (
    <section className={styles.container}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>TÀI KHOẢN</p>
        <h1>Thông tin của bạn</h1>
        <p>Quản lý hồ sơ, địa chỉ giao hàng và đơn đã đặt.</p>
      </header>
      <nav className={styles.tabs} aria-label="Tài khoản">
        <NavLink to="ho-so" className={({ isActive }) => (isActive ? styles.active : '')}>
          Hồ sơ cá nhân
        </NavLink>
        <NavLink to="dia-chi" className={({ isActive }) => (isActive ? styles.active : '')}>
          Sổ địa chỉ
        </NavLink>
        <NavLink to="don-hang" className={({ isActive }) => (isActive ? styles.active : '')}>
          Đơn hàng
        </NavLink>
        <NavLink to="doi-mat-khau" className={({ isActive }) => (isActive ? styles.active : '')}>
          Đổi mật khẩu
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
