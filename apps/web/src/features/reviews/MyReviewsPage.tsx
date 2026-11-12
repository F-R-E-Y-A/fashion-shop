import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ErrorNote, Loading, Pager } from '@/ui';

import { ReviewBody, ShopReply } from './ReviewCard.js';
import { ReviewFormDialog, type ReviewTarget } from './ReviewFormDialog.js';
import {
  formatReviewDate,
  type MyReview,
  type ReviewProduct,
  STATUS_LABELS,
} from './reviews.api.js';
import styles from './Reviews.module.css';
import { useEligibleReviews, useMyReviews } from './use-reviews.js';

function ProductLine({ product, detail }: { product: ReviewProduct; detail: string }) {
  return (
    <>
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" loading="lazy" />
      ) : (
        <span className={styles.itemImage} aria-hidden="true" />
      )}
      <div>
        <p className={styles.itemName}>
          <Link to={`/san-pham/${product.slug}`}>{product.name}</Link>
        </p>
        <p className={styles.muted}>{detail}</p>
      </div>
    </>
  );
}

function savedNotice(review: MyReview): string {
  return review.status === 'APPROVED'
    ? 'Đã đăng đánh giá. Cảm ơn bạn!'
    : 'Đã gửi đánh giá. Đánh giá sẽ hiện sau khi shop duyệt.';
}

/**
 * Tab "Danh gia" trong tai khoan (UC-11.1): dong don cho danh gia va danh gia da viet. `?don=<id>`
 * (tu trang don hang) thi chi hien dong cua don do.
 */
export function MyReviewsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'da-danh-gia' ? 'done' : 'pending';
  const orderId = params.get('don');
  const page = Math.max(1, Number(params.get('trang')) || 1);
  const eligible = useEligibleReviews();
  const mine = useMyReviews(page, tab === 'done');
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [notice, setNotice] = useState('');
  const pending = (eligible.data ?? []).filter((item) => !orderId || item.orderId === orderId);
  const go = (next: Record<string, string>) => setParams(next);

  return (
    <div className={styles.page}>
      <div className={styles.tabs} role="tablist" aria-label="Đánh giá">
        <button
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={tab === 'pending'}
          onClick={() => go({})}
        >
          Chờ đánh giá{eligible.data ? ` (${eligible.data.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={tab === 'done'}
          onClick={() => go({ tab: 'da-danh-gia' })}
        >
          Đã đánh giá
        </button>
      </div>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {tab === 'pending' && (
        <section aria-label="Sản phẩm chờ đánh giá">
          {orderId && (
            <p className={styles.muted}>
              Đang xem sản phẩm của một đơn. <Link to="/tai-khoan/danh-gia">Xem tất cả</Link>
            </p>
          )}
          {eligible.isPending && <Loading label="Đang tải sản phẩm chờ đánh giá…" />}
          {eligible.isError && (
            <ErrorNote label="Không tải được danh sách." onRetry={() => void eligible.refetch()} />
          )}
          {eligible.data && pending.length === 0 && (
            <p className={styles.empty}>
              Không có sản phẩm nào chờ đánh giá. Đơn đã giao trong 30 ngày sẽ hiện ở đây.
            </p>
          )}
          <ul className={styles.list}>
            {pending.map((item) => (
              <li key={item.orderItemId} className={styles.item}>
                <ProductLine
                  product={item.product}
                  detail={`${item.variantLabel ? `${item.variantLabel} · ` : ''}Đơn ${item.orderCode} · Hạn đánh giá ${formatReviewDate(item.reviewDeadline)}`}
                />
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setTarget({ mode: 'create', item })}
                >
                  Viết đánh giá
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'done' && (
        <section aria-label="Đánh giá đã viết">
          {mine.isPending && <Loading label="Đang tải đánh giá của bạn…" />}
          {mine.isError && (
            <ErrorNote label="Không tải được đánh giá." onRetry={() => void mine.refetch()} />
          )}
          {mine.data && mine.data.items.length === 0 && (
            <p className={styles.empty}>Bạn chưa viết đánh giá nào.</p>
          )}
          <ul className={styles.list}>
            {mine.data?.items.map((review) => (
              <li key={review.id} className={styles.card}>
                <div className={styles.item}>
                  <ProductLine
                    product={review.product}
                    detail={`${formatReviewDate(review.createdAt)}${review.editedAt ? ' · đã sửa' : ''} · Hiện tên: ${review.reviewerName}`}
                  />
                  <span className={styles.status} data-status={review.status}>
                    {STATUS_LABELS[review.status]}
                  </span>
                </div>
                <ReviewBody {...review} />
                {review.status === 'REJECTED' && review.moderationNote && (
                  <p className={styles.note}>Lý do ẩn: {review.moderationNote}</p>
                )}
                <ShopReply reply={review.reply} />
                <div className={styles.actions}>
                  <span className={styles.muted}>{review.helpfulCount} người thấy hữu ích</span>
                  {review.canEdit && (
                    <button
                      type="button"
                      className={styles.link}
                      onClick={() => setTarget({ mode: 'edit', review })}
                    >
                      Sửa (1 lần, trước {formatReviewDate(review.editDeadline)})
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {mine.data && mine.data.totalPages > 1 && (
            <Pager
              page={page}
              totalPages={mine.data.totalPages}
              total={mine.data.total}
              unit="đánh giá"
              onChange={(next) => go({ tab: 'da-danh-gia', trang: String(next) })}
            />
          )}
        </section>
      )}

      <ReviewFormDialog
        target={target}
        onClose={() => setTarget(null)}
        onSaved={(review) => {
          setTarget(null);
          setNotice(savedNotice(review));
          go({ tab: 'da-danh-gia' });
        }}
      />
    </div>
  );
}
