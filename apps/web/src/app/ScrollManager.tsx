import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());

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
    // Doi bo loc hay sap xep tren cung mot trang khong keo trang ve dau (useCatalogUrl dat keepScroll).
    const keepScroll = (location.state as { keepScroll?: boolean } | null)?.keepScroll;
    if (keepScroll && navigationType !== 'POP') return;
    const top = navigationType === 'POP' ? (positions.current.get(location.key) ?? 0) : 0;
    window.scrollTo({ left: 0, top, behavior: 'instant' });
  }, [location.key, location.state, navigationType]);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
