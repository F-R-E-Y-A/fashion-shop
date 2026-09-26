import { Link, NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/features/account';

/**
 * Khung trang cua hang. Moi trang ban cho khach deu nam trong khung nay.
 * Them trang thi them mot dong Route trong app/routes.tsx, khong sua tep nay.
 */
export function StoreLayout() {
  const { isAuthenticated, isLoading, logout, user } = useAuth();

  return (
    <div className="shell">
      <header className="shell__header">
        <Link to="/" className="brand">
          Thời trang
        </Link>
        <nav className="nav">
          <NavLink to="/" end>
            Sản phẩm
          </NavLink>
          <NavLink to="/quan-tri">Quản trị</NavLink>
        </nav>
        <div className="nav nav--account" aria-live="polite">
          {isLoading && <span className="nav__status">Đang khôi phục phiên…</span>}
          {!isLoading && !isAuthenticated && (
            <>
              <NavLink to="/login">Đăng nhập</NavLink>
              <NavLink to="/register">Đăng ký</NavLink>
            </>
          )}
          {!isLoading && isAuthenticated && (
            <>
              <span className="nav__status">{user?.email}</span>
              <button type="button" className="nav__logout" onClick={() => void logout()}>
                Đăng xuất
              </button>
            </>
          )}
        </div>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>

      <footer className="shell__footer">Tiểu luận chuyên ngành · Nhóm 3 người · Bản 0.2</footer>
    </div>
  );
}
