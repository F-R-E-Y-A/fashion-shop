import { type KeyboardEvent, type RefObject, useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';

import { STORE_NAME } from '@/core';
import { AdminIcon } from '@/ui';

import styles from './AdminLayout.module.css';

export function AdminBrand() {
  return (
    <Link className={styles.brand} to="/admin" aria-label={`${STORE_NAME} — Quản trị`}>
      <svg className={styles.symbol} viewBox="212 129 879 995" aria-hidden="true" focusable="false">
        <image href="/images/brand/freya/symbol-ivory.png" width={1254} height={1254} />
      </svg>
      <span className={styles.brandText}>
        <span className={styles.brandName}>{STORE_NAME}</span>
        <span className={styles.brandRole}>Không gian quản trị</span>
      </span>
    </Link>
  );
}

export function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className={styles.nav} aria-label="Điều hướng quản trị">
      {(
        [
          { path: '/admin', label: 'Tổng quan', icon: 'overview' },
          { path: '/admin/categories', label: 'Danh mục', icon: 'orders' },
          { path: '/admin/products', label: 'Sản phẩm', icon: 'orders' },
          { path: '/admin/promotions', label: 'Khuyến mãi', icon: 'orders' },
          { path: '/admin/users', label: 'Người dùng', icon: 'users' },
          { path: '/admin/orders', label: 'Đơn hàng', icon: 'orders' },
        ] as const
      ).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/admin'}
          className={({ isActive }) => `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`}
          onClick={onNavigate}
        >
          <AdminIcon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

const FOCUSABLE = 'button:not(:disabled), a[href]';

/** Drawer có vòng đời độc lập để cleanup chạy ngay khi guard tháo layout hoặc đổi breakpoint. */
export function AdminDrawer({
  onClose,
  returnFocusRef,
  mainRef,
}: {
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  mainRef: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.documentElement.style.overflow;
    const opener = returnFocusRef.current;
    const main = mainRef.current;
    document.documentElement.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    closeRef.current?.focus();
    // Sự kiện close trễ từ cleanup StrictMode không được đóng lần mở kế tiếp.
    const onNativeClose = () => {
      if (!dialog.open) onClose();
    };
    dialog.addEventListener('close', onNativeClose);
    return () => {
      dialog.removeEventListener('close', onNativeClose);
      if (dialog.open) dialog.close();
      document.documentElement.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
      if (document.activeElement !== opener && main?.isConnected) main.focus();
    };
  }, [onClose, returnFocusRef, mainRef]);
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0],
      last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className={styles.drawer}
      aria-label="Menu quản trị"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className={styles.drawerHeading}>
        <span className={styles.brandName}>{STORE_NAME}</span>
        <button
          ref={closeRef}
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Đóng điều hướng"
        >
          <AdminIcon name="close" />
        </button>
      </div>
      <p className={styles.navLabel}>Quản lý cửa hàng</p>
      <AdminNavigation onNavigate={onClose} />
      <Link className={styles.store} to="/" onClick={onClose}>
        Về cửa hàng ↗
      </Link>
    </dialog>
  );
}
