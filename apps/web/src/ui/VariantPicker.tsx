import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import styles from './VariantPicker.module.css';

export interface PickerColor {
  code: string;
  name: string;
  hex: string | null;
}

export interface PickerVariant {
  id: string;
  colorCode: string;
  sizeCode: string;
  /** Gia da dinh dang san de hien (vd "199.000 ₫"); ui khong tu dinh dang tien. */
  priceLabel: string;
  /** null: chua co du lieu kho, van cho chon. */
  availableQuantity: number | null;
}

interface VariantPickerProps {
  colors: readonly PickerColor[];
  variants: readonly PickerVariant[];
  currentVariantId: string;
  pending: boolean;
  onConfirm(variantId: string): void;
  onCancel(): void;
}

const soldOut = (variant: PickerVariant | undefined) => !variant || variant.availableQuantity === 0;

/**
 * Bang chon mau va co cua MOT san pham, hien ngay duoi dong dang sua (khong phai hop thoai).
 * Co het hang bi khoa; mo len thi focus vao lua chon dang chon; Esc hoac Huy dong bang.
 * Chi nhan du lieu qua props: dung chung cho gio hang va doi hang sau nay.
 */
export function VariantPicker({
  colors,
  variants,
  currentVariantId,
  pending,
  onConfirm,
  onCancel,
}: VariantPickerProps) {
  const current = variants.find((variant) => variant.id === currentVariantId);
  const [colorCode, setColorCode] = useState(current?.colorCode ?? variants[0]?.colorCode ?? '');
  const [sizeCode, setSizeCode] = useState(current?.sizeCode ?? '');
  const rootRef = useRef<HTMLDivElement>(null);
  const colorLabelId = useId();
  const sizeLabelId = useId();

  // Chi hien mau co it nhat mot bien the; giu thu tu mau cua san pham.
  const colorChoices = useMemo(
    () => colors.filter((color) => variants.some((variant) => variant.colorCode === color.code)),
    [colors, variants],
  );
  const sizesOfColor = useMemo(
    () => variants.filter((variant) => variant.colorCode === colorCode),
    [variants, colorCode],
  );
  const selected = sizesOfColor.find((variant) => variant.sizeCode === sizeCode);
  const canConfirm =
    !pending && !!selected && !soldOut(selected) && selected.id !== currentVariantId;

  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
  }, []);

  const chooseColor = (code: string) => {
    setColorCode(code);
    // Giu co dang chon neu mau moi con co do; khong thi bo chon de khach chon lai.
    const sameSize = variants.find((v) => v.colorCode === code && v.sizeCode === sizeCode);
    if (soldOut(sameSize)) setSizeCode('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      ref={rootRef}
      className={styles.picker}
      role="group"
      aria-label="Đổi phân loại"
      onKeyDown={onKeyDown}
    >
      {colorChoices.length > 1 && (
        <div className={styles.row}>
          <span id={colorLabelId} className={styles.label}>
            Màu
          </span>
          <div className={styles.options} role="group" aria-labelledby={colorLabelId}>
            {colorChoices.map((color) => (
              <button
                key={color.code}
                type="button"
                className={styles.option}
                aria-pressed={color.code === colorCode}
                disabled={pending}
                onClick={() => chooseColor(color.code)}
              >
                {color.hex && (
                  <span className={styles.swatch} style={{ background: color.hex }} aria-hidden />
                )}
                {color.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={styles.row}>
        <span id={sizeLabelId} className={styles.label}>
          Cỡ
        </span>
        <div className={styles.options} role="group" aria-labelledby={sizeLabelId}>
          {sizesOfColor.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className={styles.option}
              aria-pressed={variant.sizeCode === sizeCode}
              aria-label={soldOut(variant) ? `${variant.sizeCode}, hết hàng` : variant.sizeCode}
              disabled={pending || soldOut(variant)}
              onClick={() => setSizeCode(variant.sizeCode)}
            >
              {variant.sizeCode}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.summary} aria-live="polite">
        {selected
          ? `${selected.priceLabel}${
              selected.availableQuantity !== null ? ` · còn ${selected.availableQuantity}` : ''
            }`
          : 'Chọn cỡ còn hàng.'}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Huỷ
        </button>
        <button
          type="button"
          className={styles.confirm}
          disabled={!canConfirm}
          onClick={() => selected && onConfirm(selected.id)}
        >
          {pending ? 'Đang đổi…' : 'Xác nhận'}
        </button>
      </div>
    </div>
  );
}
