import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { formatPrice } from '@/core';

import {
  applyVoucher,
  getAvailableVouchers,
  promotionKeys,
  type Voucher,
  type VoucherApplyResult,
} from '../api/promotions.api.js';
import styles from './Promotion.module.css';

interface VoucherModalProps {
  open: boolean;
  onClose: () => void;
  subtotal: string;
  currentAppliedCode?: string;
  onSelectVoucher: (result: VoucherApplyResult) => void;
  onRemoveVoucher?: () => void;
}

export function VoucherModal({
  open,
  onClose,
  subtotal,
  currentAppliedCode,
  onSelectVoucher,
  onRemoveVoucher,
}: VoucherModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [inputCode, setInputCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: promotionKeys.availableVouchers(),
    queryFn: () => getAvailableVouchers(),
    enabled: open,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    setErrorMsg(null);
    setInputCode('');
    onClose();
  };

  const handleApplyCode = async (codeToApply: string) => {
    const code = codeToApply.trim().toUpperCase();
    if (!code) return;
    setApplying(true);
    setErrorMsg(null);
    try {
      const result = await applyVoucher(code, subtotal);
      if (result.valid) {
        onSelectVoucher(result);
        handleClose();
      } else {
        setErrorMsg(result.message || 'Mã giảm giá không hợp lệ');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không thể áp dụng mã giảm giá này';
      setErrorMsg(message);
    } finally {
      setApplying(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleApplyCode(inputCode);
  };

  const numSubtotal = parseFloat(subtotal) || 0;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) handleClose();
      }}
      aria-label="Chọn hoặc nhập mã giảm giá"
    >
      <div className={styles.dialogHeader}>
        <h2 className={styles.dialogTitle}>Mã giảm giá & Ưu đãi</h2>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={handleClose}
          aria-label="Đóng hộp thoại"
        >
          ✕
        </button>
      </div>

      <div className={styles.dialogBody}>
        <form className={styles.inputForm} onSubmit={handleSubmit}>
          <input
            type="text"
            className={styles.codeInput}
            placeholder="Nhập mã ưu đãi (vd: FREYA10)"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            disabled={applying}
            aria-label="Nhập mã giảm giá"
          />
          <button
            type="submit"
            className={styles.applyInputBtn}
            disabled={applying || !inputCode.trim()}
            aria-label="Áp dụng mã vừa nhập"
          >
            {applying ? 'Đang kiểm tra…' : 'Áp dụng'}
          </button>
        </form>

        {errorMsg && (
          <p className={styles.errorMessage} role="alert">
            {errorMsg}
          </p>
        )}

        <div>
          <p className={styles.sectionTitle}>Mã ưu đãi dành cho bạn</p>

          {isLoading ? (
            <p className={styles.voucherRequirement}>Đang tải danh sách mã…</p>
          ) : vouchers.length === 0 ? (
            <p className={styles.voucherRequirement}>Hiện chưa có mã ưu đãi khả dụng.</p>
          ) : (
            <div className={styles.voucherList}>
              {vouchers.map((v: Voucher) => {
                const minOrder = parseFloat(v.minOrderAmount || '0');
                const isEligible = numSubtotal >= minOrder;
                const isApplied = currentAppliedCode === v.code;

                return (
                  <div
                    key={v.id}
                    className={`${styles.voucherCard} ${isApplied ? styles.active : ''} ${
                      !isEligible ? styles.ineligible : ''
                    }`}
                  >
                    <div className={styles.voucherMeta}>
                      <div className={styles.voucherCodeRow}>
                        <span className={styles.voucherCode}>{v.code}</span>
                        <span className={styles.voucherTypeBadge}>
                          {v.discountType === 'PERCENTAGE'
                            ? `Giảm ${v.discountValue}%`
                            : `Giảm ${formatPrice(v.discountValue)}`}
                        </span>
                      </div>

                      <div className={styles.voucherDiscount}>
                        {v.discountType === 'PERCENTAGE' && v.maxDiscountAmount
                          ? `Giảm ${v.discountValue}% (tối đa ${formatPrice(v.maxDiscountAmount)})`
                          : v.discountType === 'PERCENTAGE'
                            ? `Giảm ${v.discountValue}% giá trị đơn`
                            : `Giảm trực tiếp ${formatPrice(v.discountValue)}`}
                      </div>

                      <div className={styles.voucherRequirement}>
                        {minOrder > 0
                          ? `Đơn tối thiểu ${formatPrice(v.minOrderAmount!)}`
                          : 'Áp dụng cho mọi giá trị đơn'}
                        {!isEligible && (
                          <span>
                            {' '}
                            · Mua thêm {formatPrice(String(minOrder - numSubtotal))} để dùng
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isApplied ? (
                        <button
                          type="button"
                          className={`${styles.voucherActionBtn} ${styles.selected}`}
                          onClick={() => {
                            onRemoveVoucher?.();
                            handleClose();
                          }}
                        >
                          Đang dùng
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.voucherActionBtn}
                          disabled={!isEligible || applying}
                          onClick={() => handleApplyCode(v.code)}
                          aria-label={`Áp dụng mã ${v.code}`}
                        >
                          Áp dụng
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
