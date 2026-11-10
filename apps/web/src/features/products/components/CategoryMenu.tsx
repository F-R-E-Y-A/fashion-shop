import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { categoryKeys, getCategories, getCategory } from '../api/index.js';
import { readCatalogParams } from '../lib/catalog-params.js';
import styles from './CategoryMenu.module.css';

const AUDIENCES = [
  { value: 'nu', label: 'Nữ' },
  { value: 'nam', label: 'Nam' },
] as const;

export function CategoryMenu() {
  const { pathname, search } = useLocation();
  const slug = pathname.startsWith('/danh-muc/') ? pathname.split('/')[2] : undefined;
  const onSearchPage = pathname === '/tim-kiem';
  const activeAudience = onSearchPage
    ? readCatalogParams(new URLSearchParams(search)).audience
    : null;
  const tree = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const current = useQuery({
    queryKey: categoryKeys.detail(slug ?? ''),
    queryFn: () => getCategory(slug ?? ''),
    enabled: Boolean(slug),
  });
  if (!tree.data) return null;
  const activeRoot = current.data?.breadcrumb[0]?.slug;
  return (
    <nav aria-label="Danh mục" className={styles.menu}>
      {AUDIENCES.map((audience) => (
        <Link
          key={audience.value}
          to={`/tim-kiem?audience=${audience.value}`}
          className={activeAudience === audience.value ? styles.active : undefined}
          aria-current={activeAudience === audience.value ? 'page' : undefined}
        >
          {audience.label}
        </Link>
      ))}
      {tree.data.map((root) => (
        <NavLink
          key={root.id}
          to={`/danh-muc/${root.slug}`}
          className={activeRoot === root.slug ? styles.active : undefined}
        >
          {root.name}
        </NavLink>
      ))}
    </nav>
  );
}
