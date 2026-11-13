import { useEffect, useRef, useState } from 'react';

import { ConfirmDialog, ErrorNote, Loading, Pager } from '@/ui';

import { ReviewCard } from './ReviewCard.js';
import {
  REPORT_LABELS,
  type ReportReason,
  type Review,
  type ReviewListParams,
  type ReviewSort,
  type ReviewSummary,
} from './reviews.api.js';
import styles from './Reviews.module.css';
import { formatRating, Stars } from './Stars.js';
import {
  useHelpfulVote,
  useProductReviews,
  useReportReview,
  useReviewSummary,
  useViewerRequest,
} from './use-reviews.js';

const PAGE_SIZE = 6;
const SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'helpful', label: 'Hữu ích nhất' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'rating_desc', label: 'Điểm cao trước' },
  { value: 'rating_asc', label: 'Điểm thấp trước' },
];
type Filter = { kind: 'all' } | { kind: 'rating'; rating: number } | { kind: 'media' | 'content' };

/**
 * Chi tai khi khu vuc sap vao man hinh (cach 400px): trang chi tiet khong cho danh gia. Trinh duyet
 * khong co IntersectionObserver (va jsdom trong kiem thu) thi hien nut "Xem danh gia".
 */
function useNearViewport() {
  const ref = useRef<HTMLElement>(null);
  // Mo bang link #danh-gia thi tai ngay, khong doi cuon.
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && window.location.hash === '#danh-gia',
  );
  const supported = typeof window !== 'undefined' && 'IntersectionObserver' in window;
  useEffect(() => {
    const node = ref.current;
    if (!supported || !node || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [supported, visible]);
  return { ref, visible, reveal: () => setVisible(true), supported };
}

function toParams(filter: Filter, sort: ReviewSort, page: number): ReviewListParams {
  return {
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(filter.kind === 'rating' ? { rating: filter.rating } : {}),
    ...(filter.kind === 'media' ? { withMedia: true } : {}),
    ...(filter.kind === 'content' ? { withContent: true } : {}),
  };
}

function SummaryPanel({
  summary,
  filter,
  onFilter,
}: {
  summary: ReviewSummary;
  filter: Filter;
  onFilter(filter: Filter): void;
}) {
  const fit = summary.fit;
  const top = Math.max(fit.tooSmall, fit.trueToSize, fit.tooLarge);
  const percent = (count: number, total: number) => (total ? Math.round((count / total) * 100) : 0);
  return (
    <div className={styles.summary}>
      <div className={styles.score}>
        <p className={styles.scoreValue}>
          {formatRating(summary.average)} <small>trên 5</small>
        </p>
        <Stars value={summary.average} size="lg" />
        <span className={styles.muted}>{summary.count} đánh giá</span>
      </div>
      <ul className={styles.bars} aria-label="Phân bố số sao">
        {summary.distribution.map((bucket) => (
          <li key={bucket.rating}>
            <button
              type="button"
              className={styles.bar}
              aria-pressed={filter.kind === 'rating' && filter.rating === bucket.rating}
              aria-label={`${bucket.rating} sao: ${bucket.count} đánh giá`}
              onClick={() => onFilter({ kind: 'rating', rating: bucket.rating })}
            >
              <span>{bucket.rating} sao</span>
              <span className={styles.track}>
                <span style={{ width: `${percent(bucket.count, summary.count)}%` }} />
              </span>
              <span>{bucket.count}</span>
            </button>
          </li>
        ))}
      </ul>
      {fit.total > 0 && (
        <div className={styles.fit}>
          <span className={styles.muted}>Kích cỡ theo {fit.total} người mua</span>
          <div className={styles.fitScale}>
            {(
              [
                ['Chật', fit.tooSmall],
                ['Vừa vặn', fit.trueToSize],
                ['Rộng', fit.tooLarge],
              ] as const
            ).map(([label, count]) => (
              <span key={label} data-top={count === top && count > 0}>
                {label} · {percent(count, fit.total)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDialog({
  review,
  onClose,
  onDone,
}: {
  review: Review | null;
  onClose(): void;
  onDone(): void;
}) {
  const report = useReportReview();
  const [reason, setReason] = useState<ReportReason>('SPAM');
  const [note, setNote] = useState('');
  return (
    <ConfirmDialog
      open={review !== null}
      title="Báo cáo đánh giá"
      subject={review ? `Đánh giá của ${review.reviewerName}` : ''}
      impacts={['Shop sẽ xem lại đánh giá này. Báo cáo không tự ẩn đánh giá.']}
      confirmLabel="Gửi báo cáo"
      pendingLabel="Đang gửi…"
      tone="primary"
      pending={report.isPending}
      onClose={onClose}
      onConfirm={() => {
        if (!review) return;
        report.mutate({ id: review.id, reason, note }, { onSuccess: onDone });
      }}
    >
      <fieldset className={styles.form}>
        <legend className="sr-only">Lý do</legend>
        {(Object.keys(REPORT_LABELS) as ReportReason[]).map((code) => (
          <label key={code} className={styles.check}>
            <input
              type="radio"
              name="report-reason"
              checked={reason === code}
              onChange={() => setReason(code)}
            />
            {REPORT_LABELS[code]}
          </label>
        ))}
        <label className={styles.field}>
          <span>Ghi chú thêm (không bắt buộc)</span>
          <textarea
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {report.isError && (
          <p className={styles.error} role="alert">
            Không gửi được báo cáo. Thử lại sau.
          </p>
        )}
      </fieldset>
    </ConfirmDialog>
  );
}

/** Khu danh gia o cuoi trang chi tiet san pham (UC-11.3): tong hop, loc, sap xep, binh chon. */
export function ProductReviews({ slug }: { slug: string }) {
  const { ref, visible, reveal, supported } = useNearViewport();
  const { viewerId } = useViewerRequest();
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<ReviewSort>('helpful');
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState<Review | null>(null);
  const [notice, setNotice] = useState('');
  const summary = useReviewSummary(slug, visible);
  const list = useProductReviews(slug, toParams(filter, sort, page), visible);
  const vote = useHelpfulVote(slug);
  const changeFilter = (next: Filter) => {
    setFilter((current) =>
      JSON.stringify(current) === JSON.stringify(next) ? { kind: 'all' } : next,
    );
    setPage(1);
  };

  return (
    <section id="danh-gia" ref={ref} className={styles.section} aria-labelledby="danh-gia-title">
      <h2 id="danh-gia-title" className={styles.sectionTitle}>
        Đánh giá sản phẩm
      </h2>
      {!visible && !supported && (
        <button type="button" className={styles.reveal} onClick={reveal}>
          Xem đánh giá
        </button>
      )}
      {visible && summary.isPending && <Loading label="Đang tải đánh giá…" />}
      {summary.isError && (
        <ErrorNote label="Không tải được đánh giá." onRetry={() => void summary.refetch()} />
      )}
      {summary.data && summary.data.count === 0 && (
        <p className={styles.empty}>
          Chưa có đánh giá nào. Khách đã nhận hàng có thể đánh giá trong 30 ngày.
        </p>
      )}
      {summary.data && summary.data.count > 0 && (
        <>
          <SummaryPanel summary={summary.data} filter={filter} onFilter={changeFilter} />
          <div className={styles.toolbar}>
            <div className={styles.chips} role="group" aria-label="Lọc đánh giá">
              <button
                type="button"
                className={styles.chip}
                aria-pressed={filter.kind === 'all'}
                onClick={() => changeFilter({ kind: 'all' })}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={styles.chip}
                aria-pressed={filter.kind === 'media'}
                onClick={() => changeFilter({ kind: 'media' })}
              >
                Có hình ảnh ({summary.data.withMediaCount})
              </button>
              <button
                type="button"
                className={styles.chip}
                aria-pressed={filter.kind === 'content'}
                onClick={() => changeFilter({ kind: 'content' })}
              >
                Có bình luận ({summary.data.withContentCount})
              </button>
            </div>
            <label>
              <span className="sr-only">Sắp xếp đánh giá</span>
              <select
                className={styles.select}
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as ReviewSort);
                  setPage(1);
                }}
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {list.isError && (
            <ErrorNote
              label="Không tải được danh sách đánh giá."
              onRetry={() => void list.refetch()}
            />
          )}
          {list.data && (
            <>
              {list.data.items.length === 0 ? (
                <p className={styles.empty}>Không có đánh giá khớp bộ lọc.</p>
              ) : (
                <ul className={styles.list} aria-busy={list.isFetching}>
                  {list.data.items.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      signedIn={viewerId !== null}
                      voting={vote.isPending && vote.variables?.id === review.id}
                      onVote={() => vote.mutate({ id: review.id, voted: review.viewerHasVoted })}
                      onReport={() => setReporting(review)}
                    />
                  ))}
                </ul>
              )}
              {list.data.totalPages > 1 && (
                <Pager
                  page={page}
                  totalPages={list.data.totalPages}
                  total={list.data.total}
                  unit="đánh giá"
                  onChange={setPage}
                />
              )}
            </>
          )}
        </>
      )}
      <ReportDialog
        review={reporting}
        onClose={() => setReporting(null)}
        onDone={() => {
          setReporting(null);
          setNotice('Đã gửi báo cáo. Cảm ơn bạn đã giúp shop giữ đánh giá trung thực.');
        }}
      />
    </section>
  );
}
