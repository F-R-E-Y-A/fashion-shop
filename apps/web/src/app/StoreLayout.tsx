import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { cartKeys, getCart } from '@/features/cart';

/**
 * Khung trang cua hang. Moi trang ban cho khach deu nam trong khung nay.
 * Them trang thi them mot dong Route trong app/routes.tsx, khong sua tep nay.
 */
export function StoreLayout() {
  const { data: cart } = useQuery({
    queryKey: cartKeys.current(),
    queryFn: getCart,
    staleTime: 30_000,
  });

  const itemCount = cart?.itemCount ?? 0;

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
          <NavLink to="/gio-hang" className="nav__cart">
            🛒
            {itemCount > 0 && <span className="nav__badge">{itemCount}</span>}
          </NavLink>
        </nav>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>

      <footer className="shell__footer">Tiểu luận chuyên ngành · Nhóm 3 người · Bản 0.2</footer>
    </div>
  );
}
