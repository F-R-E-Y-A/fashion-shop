import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { formatDateTime } from '@/core';
import { ErrorNote, Loading, Pager } from '@/ui';

import { getPublicProductReviews } from '../api/reviews.api.js';
import { reviewKeys } from '../types.js';
import styles from './ProductReviewsSection.module.css';

interface ProductReviewsSectionProps {
  slug: string;
}

export function ProductReviewsSection({ slug }: ProductReviewsSectionProps) {
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: reviewKeys.publicList(slug, page, pageSize),
    queryFn: () => getPublicProductReviews(slug, page, pageSize),
    enabled: Boolean(slug),
  });

  const items = Array.isArray(data?.items) ? data.items : [];
  const total = typeof data?.total === 'number' ? data.total : 0;
  const pageNum = typeof data?.page === 'number' ? data.page : 1;

  return (
    <section
      className={styles.section}
      aria-labelledby="reviews-heading"
      data-testid="product-reviews-section"
    >
      <div className={styles.header}>
        <h2 id="reviews-heading" className={styles.title}>
          Đánh giá của khách hàng{' '}
          {total > 0 && <span className={styles.countBadge}>· {total} đã duyệt</span>}
        </h2>
      </div>

      {isPending && (
        <div role="status" aria-live="polite">
          <Loading />
        </div>
      )}

      {isError && (
        <ErrorNote
          label={error instanceof Error ? error.message : 'Không tải được đánh giá.'}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && items.length === 0 && (
        <div className={styles.empty} data-testid="empty-reviews">
          <p>Chưa có đánh giá được duyệt</p>
        </div>
      )}

      {!isPending && !isError && items.length > 0 && (
        <>
          <ul className={styles.list} data-testid="reviews-list">
            {items.map((review) => (
              <li key={review.id} className={styles.item} data-testid="review-item">
                <div className={styles.meta}>
                  <span className={styles.stars}>{review.rating}/5 sao</span>
                  <time className={styles.date} dateTime={review.createdAt}>
                    {formatDateTime(review.createdAt)}
                  </time>
                </div>
                {review.content && <p className={styles.content}>{review.content}</p>}
              </li>
            ))}
          </ul>

          {Math.ceil(total / pageSize) > 1 && (
            <div className={styles.pagerContainer}>
              <Pager
                page={pageNum}
                totalPages={Math.ceil(total / pageSize)}
                total={total}
                unit="đánh giá"
                onChange={(nextPage) => setPage(nextPage)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
