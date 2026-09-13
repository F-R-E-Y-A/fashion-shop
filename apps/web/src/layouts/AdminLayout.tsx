import { Link, NavLink, Outlet } from 'react-router-dom';

/**
 * Khung trang quan tri, toi gian.
 *
 * Theo luat chia viec cua nhom, moi nguoi tu lam man quan tri cua chinh
 * nhung bang du lieu minh so huu, va gan them muc vao thanh ben duoi day.
 * Phan chan quyen theo vai se do phan he Tai khoan bo sung o tuan 3.
 */
export function AdminLayout() {
  return (
    <div className="admin">
      <aside className="admin__side">
        <Link to="/" className="brand brand--small">
          Về cửa hàng
        </Link>
        <nav className="admin__nav">
          <NavLink to="/quan-tri" end>
            Tổng quan
          </NavLink>
        </nav>
      </aside>

      <section className="admin__main">
        <Outlet />
      </section>
    </div>
  );
}
