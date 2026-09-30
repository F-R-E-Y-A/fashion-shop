import { useCallback, useEffect, useRef, useState } from 'react';

import { SearchIcon } from '@/ui';

import { EXAMPLE_QUERIES, HINT_ROTATE_MS } from './search-content.js';
import { SearchOverlay } from './SearchOverlay.js';
import styles from './SearchTrigger.module.css';
import { useSearchHotkeys } from './useSearchHotkeys.js';

const FADE_MS = 300;

/** Chu goi y doi qua lai giua cac cau mau; dung yen khi khach chon giam chuyen dong. */
function useRotatingHint() {
  const [index, setIndex] = useState(1);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let swap = 0;
    const timer = window.setInterval(() => {
      setFading(true);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % EXAMPLE_QUERIES.length);
        setFading(false);
      }, FADE_MS);
    }, HINT_ROTATE_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(swap);
    };
  }, []);
  return { hint: EXAMPLE_QUERIES[index], fading };
}

/** Nut tim kiem tren header cung hop thoai va phim tat cua no. */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  const { hint, fading } = useRotatingHint();

  const show = useCallback(() => {
    openerRef.current = document.activeElement;
    setOpen(true);
  }, []);

  // Tra focus ve dung noi da mo; mo bang phim tat thi focus dang o <body>, nen ve nut.
  const close = useCallback(() => {
    setOpen(false);
    const opener = openerRef.current;
    const target =
      opener instanceof HTMLElement && opener !== document.body && document.contains(opener)
        ? opener
        : buttonRef.current;
    target?.focus();
  }, []);

  useSearchHotkeys(show, !open);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-label="Mở tìm kiếm, phím tắt /"
        aria-haspopup="dialog"
        onClick={show}
      >
        <SearchIcon />
        <span className={`${styles.hint} ${fading ? styles.fading : ''}`}>Thử: {hint}</span>
        <kbd>/</kbd>
      </button>
      {open && <SearchOverlay onClose={close} />}
    </>
  );
}
