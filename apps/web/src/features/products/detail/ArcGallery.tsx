import { type CSSProperties, type KeyboardEvent } from 'react';

import styles from './ArcGallery.module.css';
import { GalleryShot } from './GalleryShot.js';
import { useArcGallery } from './useArcGallery.js';

export interface GalleryImage {
  url: string;
  alt: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={back ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  );
}

/**
 * Thu vien anh trang chi tiet theo kieu "thu do": khung xem lon, day anh cua mau dang chon xep tren
 * mot vong cung khep vong (dung doc ben trai khung tren desktop, nam ngang duoi khung tren man hep).
 * Keo, vuot tren ca khung lan day; bam the, nut, phim mui ten hay Lightbox deu doi cung mot anh
 * dang xem do trang giu. Doi mau thi day chia bai lai va khung quet sang anh dau cua mau moi.
 */
export function ArcGallery({
  images,
  active,
  onActiveChange,
  failedUrls,
  onImageError,
  onOpen,
  resetKey,
  colorName,
  emptyLabel,
}: {
  images: GalleryImage[];
  active: number;
  onActiveChange: (index: number) => void;
  failedUrls: ReadonlySet<string>;
  onImageError: (url: string) => void;
  onOpen: () => void;
  /** Doi khoa nay (doi mau) thi day ve anh dau va chia bai lai. */
  resetKey: string;
  /** Ten mau dang xem, hien tren khung; null khi san pham chi co mot mau mac dinh. */
  colorName: string | null;
  emptyLabel: string;
}) {
  const count = images.length;
  const index = Math.min(active, Math.max(0, count - 1));
  const current = images[index];
  const currentFailed = current ? failedUrls.has(current.url) : false;
  const canOpen = Boolean(current) && !currentFailed;
  const { rootRef, trackRef, cursorRef, bindCard } = useArcGallery({
    count,
    active: index,
    resetKey,
    onChange: onActiveChange,
  });
  // Nut va phim quay vong (anh cuoi sang anh dau); day tu ba anh tro len cung khep vong theo.
  const go = (delta: number) => onActiveChange((index + delta + count) % count);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Chi nghe khi chinh thu vien dang duoc focus: Enter tren nut ben trong la viec cua nut do.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight' && count > 1) go(1);
    else if (event.key === 'ArrowLeft' && count > 1) go(-1);
    else if (event.key === 'Home' && count > 1) onActiveChange(0);
    else if (event.key === 'End' && count > 1) onActiveChange(count - 1);
    else if (event.key === 'Enter' && canOpen) onOpen();
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      className={styles.gallery}
      role="group"
      aria-roledescription="thư viện ảnh"
      aria-label={
        count > 1
          ? 'Thư viện ảnh sản phẩm. Phím mũi tên trái, phải để đổi ảnh, Enter để phóng to.'
          : 'Ảnh sản phẩm'
      }
      tabIndex={count > 1 ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      <div
        className={styles.frame}
        data-cursor={canOpen ? 'zoom' : 'ui'}
        onClick={() => {
          if (canOpen) onOpen();
        }}
      >
        {current && !currentFailed ? (
          <GalleryShot shot={current} index={index} variantKey={resetKey} onError={onImageError} />
        ) : (
          <p role="status" className={styles.fallback}>
            {current ? 'Ảnh này hiện không tải được.' : emptyLabel}
          </p>
        )}
        {colorName && (
          <span className={styles.tag}>
            <i aria-hidden="true" />
            {colorName}
          </span>
        )}
        {canOpen && (
          <button
            type="button"
            className={styles.zoom}
            aria-label="Phóng to ảnh"
            data-cursor="ui"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" />
            </svg>
          </button>
        )}
        {count > 1 && (
          <>
            <div className={styles.rail} data-cursor="ui">
              <button
                type="button"
                aria-label="Ảnh trước"
                onClick={(event) => {
                  event.stopPropagation();
                  go(-1);
                }}
              >
                <Chevron back />
              </button>
              <p aria-hidden="true">
                <strong>{pad(index + 1)}</strong>
                <span>/ {pad(count)}</span>
              </p>
              <button
                type="button"
                aria-label="Ảnh tiếp theo"
                onClick={(event) => {
                  event.stopPropagation();
                  go(1);
                }}
              >
                <Chevron />
              </button>
            </div>
            <span
              className={styles.progress}
              style={{ '--progress': (index + 1) / count } as CSSProperties}
              aria-hidden="true"
            />
          </>
        )}
      </div>

      {count > 1 && (
        <div ref={trackRef} className={styles.track} data-cursor="drag">
          {images.map((image, cardIndex) => (
            <button
              key={`${image.url}-${cardIndex}`}
              ref={bindCard(cardIndex)}
              type="button"
              tabIndex={-1}
              className={styles.card}
              style={{ '--i': cardIndex } as CSSProperties}
              data-cursor="pick"
              aria-label={`Xem ảnh ${cardIndex + 1}`}
              aria-pressed={cardIndex === index}
              onClick={() => onActiveChange(cardIndex)}
            >
              <span className={styles.float}>
                {failedUrls.has(image.url) ? (
                  <span className={styles.broken}>{cardIndex + 1}</span>
                ) : (
                  <img
                    src={image.url}
                    alt=""
                    decoding="async"
                    draggable={false}
                    onError={() => onImageError(image.url)}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div ref={cursorRef} className={styles.cursor} data-zone="ui" aria-hidden="true">
        <span data-label="pick">Xem</span>
        <span data-label="drag">Kéo</span>
        <span data-label="zoom">Phóng to</span>
      </div>
      {count > 1 && (
        <p className="sr-only" aria-live="polite">
          Ảnh {index + 1} trên {count}
          {colorName ? `, màu ${colorName}` : ''}.
        </p>
      )}
    </div>
  );
}
