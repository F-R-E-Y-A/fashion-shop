import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const previousPathname = useRef(location.pathname);

  useLayoutEffect(() => {
    const key = location.key;
    const savePosition = () => positions.current.set(key, window.scrollY);
    window.addEventListener('scroll', savePosition, { passive: true });
    return () => {
      savePosition();
      window.removeEventListener('scroll', savePosition);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const prevPath = previousPathname.current;
    previousPathname.current = location.pathname;
    const state = location.state as { keepScroll?: boolean; scrollToTop?: boolean } | null;
    if (navigationType === 'POP') {
      const top = positions.current.get(location.key) ?? 0;
      window.scrollTo({ left: 0, top, behavior: 'instant' });
      return;
    }
    if (state?.scrollToTop) {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      return;
    }
    // Giu vi tri cuon khi chi doi query/hash tren cung pathname (chon bien the, tab, bo loc)
    // hoac khi caller dat keepScroll. Chi keo ve dau khi chuyen sang duong dan khac.
    if (state?.keepScroll || prevPath === location.pathname) return;
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  }, [location.key, location.pathname, location.state, navigationType]);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
