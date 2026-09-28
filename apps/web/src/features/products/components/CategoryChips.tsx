import { Link } from 'react-router-dom';

import type { CategoryDetail } from '../api/index.js';
import styles from './Catalog.module.css';

export function CategoryChips({ root, activeSlug }: { root: CategoryDetail; activeSlug: string }) {
  const chips = [{ name: 'Tất cả', slug: root.slug }, ...root.children];
  return (
    <nav aria-label="Nhóm danh mục" className={styles.chips}>
      {chips.map((chip) => (
        <Link
          key={chip.slug}
          to={`/danh-muc/${chip.slug}`}
          aria-current={chip.slug === activeSlug ? 'page' : undefined}
        >
          {chip.name}
        </Link>
      ))}
    </nav>
  );
}
