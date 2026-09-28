import { useQuery } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router-dom';

import { categoryKeys, getCategories, getCategory } from '../api/index.js';
import styles from './Catalog.module.css';

export function CategoryMenu() {
  const { pathname } = useLocation();
  const slug = pathname.startsWith('/danh-muc/') ? pathname.split('/')[2] : undefined;
  const tree = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const current = useQuery({
    queryKey: categoryKeys.detail(slug ?? ''),
    queryFn: () => getCategory(slug ?? ''),
    enabled: Boolean(slug),
  });
  if (!tree.data) return null;
  const activeRoot = current.data?.breadcrumb[0]?.slug;
  return (
    <nav aria-label="Danh mục" className={styles.categoryMenu}>
      {tree.data.map((root) => (
        <NavLink
          key={root.id}
          to={`/danh-muc/${root.slug}`}
          className={activeRoot === root.slug ? styles.activeMenu : undefined}
        >
          {root.name}
        </NavLink>
      ))}
    </nav>
  );
}
