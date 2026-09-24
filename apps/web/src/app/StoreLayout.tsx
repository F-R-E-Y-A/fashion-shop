import { Link, NavLink, Outlet } from 'react-router-dom';

/**
 * Khung trang cua hang. Moi trang ban cho khach deu nam trong khung nay.
 * Them trang thi them mot dong Route trong app/routes.tsx, khong sua tep nay.
 */
export function StoreLayout() {
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
      </header>

      <main className="shell__main">
        <Outlet />
      </main>

      <footer className="shell__footer">Tiểu luận chuyên ngành · Nhóm 3 người · Bản 0.2</footer>
    </div>
  );
}
