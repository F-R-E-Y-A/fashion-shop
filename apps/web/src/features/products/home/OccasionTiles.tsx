import { Link } from 'react-router-dom';

import { layout, SkeletonGrid } from '@/ui';

import { OCCASIONS, searchLink } from './home-content.js';
import { HomeSectionHeader } from './HomeSectionHeader.js';
import styles from './OccasionTiles.module.css';
import { useSearchCards } from './useSearchCards.js';

/** Bon dip mac, moi o la mot cau tim dung san: so goi y va ba anh nho do chinh bo tim kiem tra ve. */
export function OccasionTiles() {
  const { cards, isPending, allFailed } = useSearchCards(
    OCCASIONS.map((o) => o.q),
    3,
  );
  // Khoi phu: loi het thi an khoi, khong lam hong ca trang.
  if (allFailed) return null;
  return (
    <section className={`${layout.container} ${layout.section}`} aria-labelledby="home-occ-title">
      <HomeSectionHeader
        eyebrow="Tìm bằng câu nói"
        title="Mặc cho dịp nào?"
        titleId="home-occ-title"
      />
      {isPending ? (
        <SkeletonGrid count={4} />
      ) : (
        <ul className={styles.grid}>
          {OCCASIONS.map((occasion, index) => {
            const card = cards[index];
            return (
              <li key={occasion.title}>
                <Link className={styles.tile} to={searchLink(occasion.q)}>
                  <span className={styles.query}>“{occasion.q}”</span>
                  <span className={styles.title}>{occasion.title}</span>
                  <span className={styles.line}>{occasion.line}</span>
                  <span className={styles.thumbs}>
                    {card?.items.slice(0, 3).map((product) => (
                      <span key={product.id} className={styles.thumb}>
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt=""
                            width={300}
                            height={400}
                            loading="lazy"
                          />
                        )}
                      </span>
                    ))}
                  </span>
                  <span className={styles.count}>
                    <span>{card?.total ?? 0} gợi ý</span>
                    <span aria-hidden="true">→</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
