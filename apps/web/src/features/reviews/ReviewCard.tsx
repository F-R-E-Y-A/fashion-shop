import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { Lightbox } from '@/ui';

import { FIT_LABELS, formatReviewDate, type Review, type ReviewMedia } from './reviews.api.js';
import styles from './Reviews.module.css';
import { formatRating, Stars } from './Stars.js';

/** Anh trong danh gia: bam mo lightbox, mui ten duyet tung anh. */
export function ReviewPhotos({ photos, label }: { photos: ReviewMedia[]; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (photos.length === 0) return null;
  return (
    <>
      <ul className={styles.photos} aria-label={label}>
        {photos.map((photo, index) => (
          <li key={photo.url}>
            <button
              type="button"
              className={styles.photo}
              aria-label={`Xem ảnh ${index + 1}`}
              onClick={() => setOpen(index)}
            >
              {/* O 72 px dung ban thu nho; lightbox moi tai ban lon. */}
              <img src={photo.thumbnailUrl} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
      {open !== null && (
        <Lightbox
          images={photos.map((photo, index) => ({ url: photo.url, alt: `${label} ${index + 1}` }))}
          index={open}
          onClose={() => setOpen(null)}
          onNavigate={setOpen}
        />
      )}
    </>
  );
}

export function ReviewBody({
  rating,
  content,
  fitFeedback,
  variantLabel,
  heightCm,
  weightKg,
  media,
}: Pick<
  Review,
  'rating' | 'content' | 'fitFeedback' | 'variantLabel' | 'heightCm' | 'weightKg' | 'media'
>) {
  const body = [
    variantLabel && `Phân loại: ${variantLabel}`,
    fitFeedback && `Kích cỡ: ${FIT_LABELS[fitFeedback]}`,
    heightCm && `Cao ${heightCm} cm`,
    weightKg && `Nặng ${weightKg} kg`,
  ].filter(Boolean);
  return (
    <>
      <Stars value={rating} label={`${formatRating(rating)} trên 5 sao`} />
      {body.length > 0 && (
        <p className={styles.meta}>
          {body.map((part) => (
            <span key={String(part)}>{part}</span>
          ))}
        </p>
      )}
      {content && <p className={styles.content}>{content}</p>}
      <ReviewPhotos photos={media} label="Ảnh khách gửi" />
    </>
  );
}

export function ShopReply({ reply }: { reply: Review['reply'] }) {
  if (!reply) return null;
  return (
    <div className={styles.reply}>
      <strong>Phản hồi của shop</strong> · {formatReviewDate(reply.repliedAt)}
      <p>{reply.content}</p>
    </div>
  );
}

/**
 * Mot danh gia tren trang san pham. Khach vang lai thay link dang nhap thay cho nut huu ich; danh
 * gia cua chinh minh khong co nut huu ich va bao cao (may chu cung chan, 422 OWN_REVIEW).
 */
export function ReviewCard({
  review,
  signedIn,
  voting,
  onVote,
  onReport,
}: {
  review: Review;
  signedIn: boolean;
  voting: boolean;
  onVote(): void;
  onReport(): void;
}) {
  const location = useLocation();
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.reviewer}>{review.reviewerName}</span>
        <span className={styles.muted}>
          {formatReviewDate(review.createdAt)}
          {review.editedAt && ' · đã sửa'}
        </span>
      </div>
      <ReviewBody {...review} />
      <ShopReply reply={review.reply} />
      <div className={styles.actions}>
        {review.isOwn ? (
          <span className={styles.muted}>Đánh giá của bạn · {review.helpfulCount} hữu ích</span>
        ) : signedIn ? (
          <>
            <button
              type="button"
              className={styles.link}
              aria-pressed={review.viewerHasVoted}
              disabled={voting}
              onClick={onVote}
            >
              Hữu ích ({review.helpfulCount})
            </button>
            <button type="button" className={styles.link} onClick={onReport}>
              Báo cáo
            </button>
          </>
        ) : (
          <Link
            className={styles.link}
            to="/login"
            state={{ from: location.pathname + location.search }}
          >
            Hữu ích ({review.helpfulCount}) · đăng nhập để bình chọn
          </Link>
        )}
      </div>
    </li>
  );
}
