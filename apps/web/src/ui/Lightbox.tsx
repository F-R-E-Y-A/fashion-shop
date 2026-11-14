import { type KeyboardEvent, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import styles from './Lightbox.module.css';

/** Anh cua gallery: cung hinh dang voi ProductDetailPage dung hien tai. */
export interface LightboxImage {
  url: string;
  alt?: string | null;
}

/**
 * Xem anh giua trang (lightbox): anh chinh cua trang chi tiet san pham, anh trong danh gia.
 * Dong bang ESC, nut X hoac bam ra ngoai anh; ← / → duyet vong quay lai.
 * Chi la mot lop xem: du lieu va chi so anh van do trang giu, doi anh qua onNavigate.
 */
/** Dem so lightbox dang mo: khoa cuon nen khi cai dau mo, tra lai gia tri cu khi cai cuot cung dong.
 *  Kieu dem de hai lightbox (hoac test chong instance) khong giai khoac som cho nhau. */
let openCount = 0;
let previousOverflow = '';

export function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
}: {
  images: LightboxImage[];
  /** Anh dang xem: 0..images.length-1, do trang cha quan ly. */
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    openCount += 1;
    if (openCount === 1) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = previousOverflow;
      restoreFocus.current?.focus();
    };
  }, []);

  const total = images.length;
  const onBackdropKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onNavigate((index - 1 + total) % total);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      onNavigate((index + 1) % total);
    }
  };

  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Thư viện ảnh sản phẩm"
      onClick={onClose}
      onKeyDown={onBackdropKeyDown}
    >
      <button
        ref={closeRef}
        type="button"
        className={styles.close}
        aria-label="Đóng thư viện"
        onClick={onClose}
      >
        ✕
      </button>
      {total > 1 && (
        <>
          <button
            type="button"
            className={`${styles.arrow} ${styles.previous}`}
            aria-label="Ảnh trước"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index - 1 + total) % total);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.arrow} ${styles.next}`}
            aria-label="Ảnh tiếp theo"
            onClick={(event) => {
              event.stopPropagation();
              onNavigate((index + 1) % total);
            }}
          >
            ›
          </button>
        </>
      )}
      {/* Bam vao anh khong dong: chi bam ra vung backdrop ben ngoai moi dong. */}
      <figure className={styles.figure} onClick={(event) => event.stopPropagation()}>
        <img className={styles.image} src={current.url} alt={current.alt ?? ''} />
        {total > 1 && (
          <figcaption className={styles.counter}>
            {index + 1} / {total}
          </figcaption>
        )}
      </figure>
    </div>,
    document.body,
  );
}
