import { useEffect } from 'react';

const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * Phim tat mo o tim kiem: "/" (khi khong dang go trong o nhap) va Ctrl/Cmd + K.
 * Chi lang nghe khi `enabled`, de khi hop thoai dang mo thi phim "/" go vao o nhap binh thuong.
 */
export function useSearchHotkeys(onOpen: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const typing = event.target instanceof Element && event.target.closest(TYPING) !== null;
      const plainSlash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey;
      const chord = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if ((plainSlash && !typing) || chord) {
        event.preventDefault();
        onOpen();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onOpen, enabled]);
}
