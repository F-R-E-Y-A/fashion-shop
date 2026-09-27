import { Link, Outlet } from 'react-router-dom';

import { CategoryMenu } from '@/features/products';
import { SearchIcon } from '@/ui';

import styles from './StoreLayout.module.css';

export function StoreLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} to="/">
          THỜI TRANG
        </Link>
        <CategoryMenu />
        <Link to="/san-pham" aria-label="Tìm sản phẩm">
          <SearchIcon />
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <div>
          <Link className={styles.brand} to="/">
            THỜI TRANG
          </Link>
          <p>Phong cách là tự do.</p>
        </div>
        <div>
          <p>DANH MỤC</p>
          <CategoryMenu />
        </div>
        <small>
          © {new Date().getFullYear()} Thời Trang · <Link to="/quan-tri">Quản trị</Link>
        </small>
      </footer>
    </div>
  );
}
