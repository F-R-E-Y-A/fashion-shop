import { useState } from 'react';

import styles from './GalleryShot.module.css';

interface Shot {
  url: string;
  alt: string;
}
/** Cach anh moi vao khung: theo chieu day anh troi, hoac quet tu tren xuong khi doi mau. */
type Move = 'next' | 'prev' | 'swap';

interface Layers {
  current: Shot;
  previous: Shot | null;
  index: number;
  variantKey: string;
  move: Move;
}

/**
 * Anh trong khung xem chinh. Anh moi phu len anh cu bang mot duong cat: sang anh sau thi vao tu
 * phai, anh truoc tu trai (cung chieu day anh troi), doi mau thi quet tu tren xuong nhu "mac thu"
 * bo moi. Anh cu nam ngay ben duoi nen khong co khoang trong khi anh moi dang tai. Anh dau tien
 * hien ngay, khong hieu ung: day la anh lon nhat trang (LCP).
 */
export function GalleryShot({
  shot,
  index,
  variantKey,
  onError,
}: {
  shot: Shot;
  index: number;
  variantKey: string;
  onError: (url: string) => void;
}) {
  const [layers, setLayers] = useState<Layers>({
    current: shot,
    previous: null,
    index,
    variantKey,
    move: 'next',
  });
  // State dan xuat tu props (khong dung effect): doi anh la doi ngay trong lan render nay.
  if (
    layers.current.url !== shot.url ||
    layers.current.alt !== shot.alt ||
    layers.variantKey !== variantKey
  ) {
    const move: Move =
      layers.variantKey !== variantKey ? 'swap' : index >= layers.index ? 'next' : 'prev';
    setLayers({ current: shot, previous: layers.current, index, variantKey, move });
  }
  const { current, previous, move } = layers;
  const swapped = previous !== null && previous.url !== current.url;

  return (
    <span className={styles.media}>
      {swapped && (
        <img
          className={`${styles.image} ${styles.under}`}
          src={previous.url}
          alt=""
          draggable={false}
        />
      )}
      <img
        key={current.url}
        className={`${styles.image} ${swapped ? styles.reveal : ''}`}
        data-move={move}
        src={current.url}
        alt={current.alt}
        fetchPriority={swapped ? 'auto' : 'high'}
        draggable={false}
        onError={() => onError(current.url)}
        // Mo xong thi bo anh cu: khung dat o toa do le (vd. top 141.33px) nen mep duoi anh moi
        // khu rang cua, de lo mot hang diem anh cua anh cu thanh vet sam.
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            setLayers((value) => (value.previous ? { ...value, previous: null } : value));
          }
        }}
      />
      {swapped && (
        <span
          key={`scan-${move}-${current.url}`}
          className={styles.scan}
          data-move={move}
          aria-hidden="true"
        />
      )}
    </span>
  );
}
