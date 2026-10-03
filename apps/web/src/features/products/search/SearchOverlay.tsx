import { useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { SearchIcon } from '@/ui';

import { categoryKeys, getCategories } from '../api/index.js';
import { emptyCatalogParams, writeCatalogParams } from '../lib/catalog-params.js';
import { buildGroups, type OverlayOption } from './overlay-groups.js';
import { OverlayList } from './OverlayList.js';
import { readRecentSearches, rememberSearch } from './search-history.js';
import styles from './SearchOverlay.module.css';
import { useSuggestions } from './useSuggestions.js';

const searchUrl = (q: string) =>
  `/tim-kiem?${writeCatalogParams({ ...emptyCatalogParams, q }).toString()}`;

/**
 * O tim kiem toan cuc: hop thoai modal, o nhap theo mau combobox ARIA 1.2.
 * Dung trong portal de khong ket trong ngan xep z-index cua header.
 */
export function SearchOverlay({ onClose }: { onClose: () => void }) {
  const uid = useId();
  const listId = `${uid}-list`;
  const titleId = `${uid}-title`;
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState('');
  const [recent] = useState(readRecentSearches);
  const [cursor, setCursor] = useState({ signature: '', index: -1 });

  const trimmed = text.trim();
  const categories = useQuery({ queryKey: categoryKeys.tree(), queryFn: getCategories });
  const suggestions = useSuggestions(text);

  const groups = useMemo(
    () =>
      buildGroups(
        { text: trimmed, recent, categories: categories.data ?? [], suggestion: suggestions.data },
        `${uid}-o`,
      ),
    [trimmed, recent, categories.data, suggestions.data, uid],
  );
  const options = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  // Vi tri dang chon chi co gia tri voi dung danh sach da tao ra no: danh sach doi thi ve "chua chon".
  const signature = options.map((option) => option.id + option.primary).join('|');
  const index = cursor.signature === signature ? cursor.index : -1;
  const activeId = options[index]?.id;
  const terms = useMemo(
    () => suggestions.data?.interpretation.termGroups.flat() ?? [],
    [suggestions.data],
  );

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeId]);

  const pick = (option: OverlayOption) => {
    const { action } = option;
    if (action.type === 'query') {
      rememberSearch(action.value);
      void navigate(searchUrl(action.value));
    } else if (action.type === 'category') {
      void navigate(`/danh-muc/${action.slug}`);
    } else {
      void navigate(`/san-pham/${action.slug}`);
    }
    onClose();
  };

  const move = (step: number) => {
    if (options.length === 0) return;
    const from = index === -1 ? (step > 0 ? -1 : options.length) : index;
    setCursor({ signature, index: (from + step + options.length) % options.length });
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = options[index];
      if (chosen) pick(chosen);
      else if (trimmed)
        pick({ id: '', action: { type: 'query', value: trimmed }, primary: trimmed });
    }
  };

  // Esc dong o moi cho; Tab chi xoay giua o nhap va nut dong.
  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const next =
        document.activeElement === inputRef.current ? closeRef.current : inputRef.current;
      next?.focus();
    }
  };

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onDialogKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          Tìm kiếm
        </h2>
        <div className={styles.top}>
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="Tìm sản phẩm"
            autoComplete="off"
            placeholder="Bạn muốn mặc gì hôm nay?"
            value={text}
            maxLength={120}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="Đóng tìm kiếm"
            onClick={onClose}
          >
            <span className={styles.escLabel}>Esc</span>
            <span className={styles.closeLabel}>Đóng</span>
          </button>
        </div>
        <div
          className={`${styles.progress} ${suggestions.isWaiting ? styles.on : ''}`}
          aria-hidden="true"
        />
        <OverlayList id={listId} groups={groups} activeId={activeId} terms={terms} onPick={pick} />
        {suggestions.isError && (
          <p className={styles.error} role="alert">
            Không tải được gợi ý. Nhấn Enter để tìm đầy đủ.
          </p>
        )}
        <p className="sr-only" role="status">
          {suggestions.data && trimmed ? `${suggestions.data.total} sản phẩm khớp` : ''}
        </p>
        <div className={styles.foot}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> chọn
          </span>
          <span>
            <kbd>↵</kbd> mở
          </span>
          <span>
            <kbd>Esc</kbd> đóng
          </span>
          <span className={styles.footNote}>Gợi ý hiện sau 300 ms ngừng gõ</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
