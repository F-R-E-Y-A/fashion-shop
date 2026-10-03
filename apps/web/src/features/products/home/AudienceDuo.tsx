import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { layout } from '@/ui';

import { type Audience, listProducts, type ListProductsParams, productKeys } from '../api/index.js';
import styles from './AudienceDuo.module.css';

const CHIPS_SHOWN = 4;

const AUDIENCES: ReadonlyArray<{
  value: Audience;
  eyebrow: string;
  title: string;
  cta: string;
  className: 'women' | 'men';
}> = [
  { value: 'nu', eyebrow: 'Cho nàng', title: 'Nàng', cta: 'Xem đồ nữ', className: 'women' },
  { value: 'nam', eyebrow: 'Cho chàng', title: 'Chàng', cta: 'Xem đồ nam', className: 'men' },
];

/**
 * Hai o Nang/Chang. Moi o mot loi goi: tong so va danh muc con co san pham cho doi tuong do
 * (facets.categories), xep giam dan theo so, toi da bon chip.
 */
export function AudienceDuo() {
  const results = useQueries({
    queries: AUDIENCES.map(({ value }) => {
      const params: ListProductsParams = { audience: value, facets: true, pageSize: 1 };
      return { queryKey: productKeys.list(params), queryFn: () => listProducts(params) };
    }),
  });
  if (results.every((result) => result.isError)) return null;
  return (
    <section className={`${layout.container} ${layout.section}`} aria-label="Cho nàng và cho chàng">
      <div className={styles.duo}>
        {AUDIENCES.map((audience, index) => {
          const data = results[index]?.data;
          const chips = (data?.facets?.categories ?? [])
            .filter((c) => c.parentSlug !== null && c.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, CHIPS_SHOWN);
          return (
            <article key={audience.value} className={styles[audience.className]}>
              {audience.className === 'women' && (
                <img src="/images/home/hero.webp" alt="" width={1672} height={941} loading="lazy" />
              )}
              <p className={styles.eyebrow}>{audience.eyebrow}</p>
              <h3>{audience.title}</h3>
              {data && <p className={styles.count}>{data.total} sản phẩm</p>}
              {chips.length > 0 && (
                <ul className={styles.chips}>
                  {chips.map((chip) => (
                    <li key={chip.slug}>
                      <Link to={`/tim-kiem?audience=${audience.value}&categories=${chip.slug}`}>
                        {chip.name} · {chip.count}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link className={styles.cta} to={`/tim-kiem?audience=${audience.value}`}>
                {audience.cta}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
