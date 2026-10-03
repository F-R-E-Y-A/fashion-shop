import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** Cuon qua ngan nay thi header dac mau; chua qua thi (o trang chu) trong suot tren hero. */
const SOLID_AFTER_PX = 40;

/**
 * Trang thai cua header cua hang:
 * - `isHome`: trang chu, hero truot len duoi header nen header co margin-bottom am.
 * - `overHero`: dang o dau trang chu, header trong suot va chu sang.
 * - `headerRef`: header duoc do bang ResizeObserver va dat len `--header-h`; header cao 78 px tren
 *   may tinh nhung hai hang tren dien thoai, nen khong duoc go so cung o CSS cua cac trang.
 */
export function useHeaderState() {
  const { pathname } = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(() => window.scrollY >= SOLID_AFTER_PX);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY >= SOLID_AFTER_PX);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const publish = () =>
      document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    publish();
    return () => observer.disconnect();
  }, []);

  const isHome = pathname === '/';
  return { headerRef, isHome, overHero: isHome && !scrolled };
}
