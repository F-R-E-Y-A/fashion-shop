import { type ReactNode, useEffect, useRef, useState } from 'react';

import { AdminIcon } from '@/ui';

import styles from './UserFilterDisclosure.module.css';

/** Giữ điều khiển trong DOM khi thu gọn để không mất draft, focus hoặc vòng debounce của feature. */
export function UserFilterDisclosure({
  active,
  children,
}: {
  active: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [initialOpen] = useState(
    () =>
      typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 720px)').matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(max-width: 720px)');
    const onChange = () => {
      const details = ref.current;
      if (!details) return;
      if (media.matches && details.contains(document.activeElement))
        details.querySelector('summary')?.focus();
      details.open = !media.matches;
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return (
    <details ref={ref} open={initialOpen} className={styles.disclosure}>
      <summary className={styles.toggle}>
        <AdminIcon name="filter" />
        Bộ lọc{active > 0 && <span>({active})</span>}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
