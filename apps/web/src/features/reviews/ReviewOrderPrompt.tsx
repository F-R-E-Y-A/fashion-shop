import { Link } from 'react-router-dom';

import styles from './Reviews.module.css';
import { useEligibleReviews } from './use-reviews.js';

/** Trang don da giao: con dong chua danh gia thi moi khach danh gia; khong con thi khong hien gi. */
export function ReviewOrderPrompt({ orderId }: { orderId: string }) {
  const eligible = useEligibleReviews();
  const count = eligible.data?.filter((item) => item.orderId === orderId).length ?? 0;
  if (count === 0) return null;
  return (
    <p className={styles.prompt}>
      <Link
        className={styles.primary}
        to={`/tai-khoan/danh-gia?don=${encodeURIComponent(orderId)}`}
      >
        Đánh giá {count} sản phẩm
      </Link>
    </p>
  );
}
