import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

import { Empty, ErrorNote, layout, SkeletonGrid } from '@/ui';

import { listProducts, type ListProductsParams, productKeys } from '../api/index.js';
import { ProductCard } from '../components/ProductCard.js';
import { HomeSectionHeader } from './HomeSectionHeader.js';
import styles from './ProductRail.module.css';

const RAIL_PARAMS: ListProductsParams = { sort: 'newest', pageSize: 10 };
const SCROLL_STEP = 0.8;

/** Hang moi ve: dai cuon ngang co diem dung, hai nut mui ten cuon 80% be rong. */
export function ProductRail() {
  const railRef = useRef<HTMLUListElement>(null);
  const products = useQuery({
    queryKey: productKeys.list(RAIL_PARAMS),
    queryFn: () => listProducts(RAIL_PARAMS),
  });

  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    rail?.scrollBy({ left: direction * rail.clientWidth * SCROLL_STEP, behavior: 'smooth' });
  };

  return (
    <section className={layout.section} aria-labelledby="home-new-title">
      <div className={layout.container}>
        <HomeSectionHeader eyebrow="Vừa lên kệ" title="Hàng mới về" titleId="home-new-title">
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.round}
              aria-label="Cuộn về trước"
              onClick={() => scroll(-1)}
            >
              ←
            </button>
            <button
              type="button"
              className={styles.round}
              aria-label="Cuộn tiếp"
              onClick={() => scroll(1)}
            >
              →
            </button>
            <Link className={styles.all} to="/tim-kiem">
              Xem tất cả
            </Link>
          </div>
        </HomeSectionHeader>
        {products.isPending && <SkeletonGrid count={4} />}
        {products.isError && (
          <ErrorNote label="Không tải được trang chủ." onRetry={() => void products.refetch()} />
        )}
        {products.data?.items.length === 0 && <Empty label="Chưa có sản phẩm để khám phá." />}
        {products.data && products.data.items.length > 0 && (
          <ul
            ref={railRef}
            className={styles.rail}
            tabIndex={0}
            aria-label="Hàng mới về, cuộn ngang"
          >
            {products.data.items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
