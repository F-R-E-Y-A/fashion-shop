import { Link, NavLink, Outlet } from 'react-router-dom';

/**
 * Khung trang quan tri, toi gian.
 *
 * Moi nguoi tu lam man quan tri cua chinh nhung bang minh so huu, dat trong feature cua minh,
 * roi them mot NavLink o day. Phan chan quyen theo vai do phan he Tai khoan bo sung o tuan 3.
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
