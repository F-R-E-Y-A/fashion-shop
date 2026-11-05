import { useQuery } from '@tanstack/react-query';

import { formatPrice } from '@/core';

import { evaluateCart, type EvaluatedPromotionItem, promotionKeys } from '../api/promotions.api.js';
import styles from './Promotion.module.css';

interface BestPromotionBannerProps {
  subtotal: string;
  itemCount: number;
  items?: { variantId: string; categorySlug?: string; price: string; quantity: number }[];
  appliedPromotionId?: string;
  onApplyBest: (promo: EvaluatedPromotionItem) => void;
}

export function BestPromotionBanner({
  subtotal,
  itemCount,
  items,
  appliedPromotionId,
  onApplyBest,
}: BestPromotionBannerProps) {
  const numSubtotal = parseFloat(subtotal) || 0;

  const { data } = useQuery({
    queryKey: promotionKeys.evaluate(subtotal, itemCount),
    queryFn: () => evaluateCart(subtotal, items),
    enabled: numSubtotal > 0 && itemCount > 0,
    staleTime: 30_000,
  });

  const best = data?.bestPromotion;
  if (!best || parseFloat(best.discountAmount) <= 0) return null;
  if (appliedPromotionId === best.promotionId) return null;

  return (
    <div className={styles.bestBanner} role="region" aria-label="Gợi ý khuyến mãi tốt nhất">
      <div className={styles.bestBannerInfo}>
        <span className={styles.bestBannerIcon} aria-hidden="true">
          ✨
        </span>
        <div className={styles.bestBannerText}>
          <p className={styles.bestBannerTitle}>Gợi ý ưu đãi tốt nhất cho giỏ hàng</p>
          <p className={styles.bestBannerDesc}>
            {best.name} · Tiết kiệm <strong>{formatPrice(best.discountAmount)}</strong>
          </p>
        </div>
      </div>

      <button
        type="button"
        className={styles.applyBestBtn}
        onClick={() => onApplyBest(best)}
        aria-label={`Áp dụng ưu đãi ${best.name}`}
      >
        Áp dụng ngay
      </button>
    </div>
  );
}
