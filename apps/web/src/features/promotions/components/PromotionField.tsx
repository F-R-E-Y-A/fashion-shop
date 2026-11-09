import { useState } from 'react';

import { useAppliedPromotion } from '../hooks/useAppliedPromotion.js';
import styles from './Promotion.module.css';
import { VoucherModal } from './VoucherModal.js';

interface PromotionFieldProps {
  subtotal: string;
}

export function PromotionField({ subtotal }: PromotionFieldProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { applied, applyVoucherResult, removePromotion } = useAppliedPromotion();

  return (
    <div className={styles.promotionControl}>
      <div className={styles.promotionLabel}>
        <span>Khuyến mãi</span>
        <button
          type="button"
          className={styles.chooseVoucherBtn}
          onClick={() => setModalOpen(true)}
          aria-label={applied ? 'Đổi mã ưu đãi' : 'Chọn hoặc nhập mã ưu đãi'}
        >
          {applied ? 'Đổi mã' : 'Chọn mã ưu đãi'}
        </button>
      </div>

      <div className={styles.inputWrap}>
        <input
          aria-label="Khuyến mãi"
          value={applied ? applied.code || applied.name : ''}
          readOnly
          disabled={!applied}
          placeholder="Chưa áp dụng"
          onClick={() => setModalOpen(true)}
        />
        {applied && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={removePromotion}
            aria-label="Gỡ mã ưu đãi"
          >
            Gỡ
          </button>
        )}
      </div>

      <VoucherModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        subtotal={subtotal}
        currentAppliedCode={applied?.kind === 'VOUCHER' ? applied.code : undefined}
        onSelectVoucher={(result) => {
          applyVoucherResult(result);
        }}
        onRemoveVoucher={removePromotion}
      />
    </div>
  );
}
