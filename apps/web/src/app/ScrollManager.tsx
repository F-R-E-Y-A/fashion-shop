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
    const top = navigationType === 'POP' ? (positions.current.get(location.key) ?? 0) : 0;
    window.scrollTo({ left: 0, top, behavior: 'instant' });
  }, [location.key, navigationType]);

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  return null;
}
