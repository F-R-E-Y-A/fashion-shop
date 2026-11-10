import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ErrorNote, layout, SkeletonGrid } from '@/ui';

import { categoryKeys, type CategoryNode, getCategories } from '../api/index.js';
import styles from './CategoryBento.module.css';
import { CATEGORY_IMAGES } from './home-content.js';
import { HomeSectionHeader } from './HomeSectionHeader.js';

const TILES_SHOWN = 3;

function Tile({ root, big }: { root: CategoryNode; big: boolean }) {
  const image = CATEGORY_IMAGES[root.slug];
  const links = root.children.filter((child) => child.productCount > 0);
  return (
    <article className={`${styles.tile} ${big ? styles.big : ''}`}>
      {image && <img src={image.src} alt={image.alt} width={1000} height={1250} loading="lazy" />}
      {/* Link phu ca o; chip la Link anh em (khong long nhau) nam tren lop phu. */}
      <Link
        className={styles.cover}
        to={`/danh-muc/${root.slug}`}
        aria-label={`Xem tất cả ${root.name.toLowerCase()}`}
      />
      <div className={styles.body}>
        <h3>{root.name}</h3>
        <p className={styles.count}>{root.productCount} sản phẩm</p>
        {links.length > 0 && (
          <ul className={styles.links}>
            {links.map((child) => (
              <li key={child.id}>
                <Link to={`/danh-muc/${child.slug}`}>
                  {child.name} · {child.productCount}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Ba loi vao tu do: Ao la o lon hai hang, Quan va Phu kien la hai o nho. Danh muc 0 san pham bi an. */
export function CategoryBento() {
  const tree = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const roots = (tree.data ?? []).filter((root) => root.productCount > 0).slice(0, TILES_SHOWN);
  if (tree.data && roots.length === 0) return null;
  return (
    <section className={`${layout.container} ${layout.section}`} aria-labelledby="home-cat-title">
      <HomeSectionHeader
        eyebrow="Mua theo danh mục"
        title="Ba lối vào tủ đồ"
        titleId="home-cat-title"
      />
      {tree.isPending && <SkeletonGrid count={3} />}
      {tree.isError && (
        <ErrorNote label="Không tải được danh mục." onRetry={() => void tree.refetch()} />
      )}
      {roots.length > 0 && (
        <div className={styles.bento}>
          {roots.map((root, index) => (
            <Tile key={root.id} root={root} big={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}
