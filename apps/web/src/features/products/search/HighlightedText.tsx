import { useMemo } from 'react';

import { highlightRanges, splitByRanges } from '../lib/highlight.js';
import styles from './HighlightedText.module.css';

/** Ten san pham voi phan khop cau tim duoc to sang bang <mark>. Khong co `terms` thi la chu thuong. */
export function HighlightedText({ text, terms }: { text: string; terms?: readonly string[] }) {
  const parts = useMemo(
    () => (terms?.length ? splitByRanges(text, highlightRanges(text, terms)) : null),
    [text, terms],
  );
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.marked ? (
          <mark key={index} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
