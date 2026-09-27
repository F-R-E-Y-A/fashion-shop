import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Empty, ErrorNote, SkeletonGrid } from '@/ui';

import { categoryKeys, getCategories, listProducts, productKeys } from '../api/index.js';
import styles from './Catalog.module.css';

export function CategoryTiles() {
  const tree = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const images = useQueries({
    queries: (tree.data ?? []).map((root) => {
      const params = { categorySlug: root.slug, pageSize: 1, sort: 'newest' as const };
      return { queryKey: productKeys.list(params), queryFn: () => listProducts(params) };
    }),
  });
  if (tree.isPending) return <SkeletonGrid count={3} />;
  if (tree.isError)
    return <ErrorNote label="Không tải được danh mục." onRetry={() => void tree.refetch()} />;
  if (tree.data.length === 0) return <Empty label="Chưa có danh mục để khám phá." />;
  return (
    <section className={styles.categoryTiles} aria-label="Mua theo danh mục">
      {tree.data.map((root, index) => {
        const image = images[index]?.data?.items[0]?.imageUrl;
        return (
          <Link key={root.id} to={`/danh-muc/${root.slug}`} className={styles.tile}>
            {image && <img src={image} alt="" loading="lazy" />}
            <span>
              <strong>{root.name}</strong>
              <small>KHÁM PHÁ →</small>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
