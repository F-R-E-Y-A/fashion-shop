import { HighlightedText } from './HighlightedText.js';
import type { OverlayGroup, OverlayOption } from './overlay-groups.js';
import styles from './SearchOverlay.module.css';

/** Danh sach lua chon cua o tim kiem: listbox ARIA co nhom, moi lua chon la mot option. */
export function OverlayList({
  id,
  groups,
  activeId,
  terms,
  onPick,
}: {
  id: string;
  groups: OverlayGroup[];
  activeId: string | undefined;
  /** Cac tu cua cau tim de to sang trong ten san pham. */
  terms: readonly string[];
  onPick: (option: OverlayOption) => void;
}) {
  return (
    // Giu focus o o nhap khi bam chuot vao danh sach.
    <div
      id={id}
      className={styles.body}
      role="listbox"
      aria-label="Gợi ý tìm kiếm"
      onMouseDown={(event) => event.preventDefault()}
    >
      {groups.map((group) => (
        <div key={group.id} className={styles.group} role="group" aria-labelledby={group.id}>
          <h3 id={group.id}>{group.title}</h3>
          {group.options.map((option) => (
            <div
              key={option.id}
              id={option.id}
              className={styles.option}
              role="option"
              aria-selected={option.id === activeId}
              onClick={() => onPick(option)}
            >
              {option.product && (
                <span className={styles.thumb}>
                  {option.product.imageUrl && <img src={option.product.imageUrl} alt="" />}
                </span>
              )}
              <span className={styles.text}>
                <HighlightedText text={option.primary} terms={option.product ? terms : undefined} />
                {option.secondary && <small>{option.secondary}</small>}
              </span>
              {option.trailing && <span className={styles.trailing}>{option.trailing}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
