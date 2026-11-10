import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';

import styles from './ConfirmDialog.module.css';

/** O nhap trong children (ly do, so tien) cung nam trong vong Tab cua hop. */
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  subject: string;
  impacts: readonly string[];
  confirmLabel: string;
  pendingLabel: string;
  tone: 'danger' | 'primary';
  pending: boolean;
  onConfirm(): void;
  /** Dong hop: Huy, Esc hay trinh duyet tu dong. Khi dang xu ly, dong KHONG huy thao tac o may chu. */
  onClose(): void;
  /**
   * Nut da mo hop. Truyen ro thay vi doc document.activeElement: Safari khong dat focus vao nut
   * khi click, nen phan tu dang focus luc mo co the la body.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * Hop xac nhan dung <dialog> native mo bang showModal(): trinh duyet dua hop len top layer, lam
 * phan con lai cua trang inert va phat su kien `cancel` khi bam Esc. Them o day nhung thu native
 * chua lam: focus dau tien vao Huy, Tab vong trong hop, khoa cuon nen, tra focus ve nut da mo hop.
 */
export function ConfirmDialog({
  open,
  title,
  subject,
  impacts,
  confirmLabel,
  pendingLabel,
  tone,
  pending,
  onConfirm,
  onClose,
  returnFocusRef,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    openerRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    cancelRef.current?.focus();

    // Trinh duyet co the tu dong hop (vd Chrome bo qua preventDefault khi Esc lap lai): bao cha.
    // Su kien `close` duoc trinh duyet xep hang, nen close() o cleanup cua lan effect truoc (StrictMode
    // chay effect hai lan khi mount) toi SAU khi hop da mo lai: hop con mo thi bo qua.
    const onNativeClose = () => {
      if (!dialog.open) onCloseRef.current();
    };
    dialog.addEventListener('close', onNativeClose);

    return () => {
      dialog.removeEventListener('close', onNativeClose);
      if (dialog.open) dialog.close();
      root.style.overflow = previousOverflow;
      const opener = openerRef.current;
      if (opener?.isConnected) opener.focus();
    };
  }, [open, returnFocusRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const focusables = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-tone={tone}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        // Esc: tu dong hop theo state cua cha, khong de trinh duyet dong rieng.
        event.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.subject}>{subject}</p>
      <ul id={descriptionId} className={styles.impacts}>
        {impacts.map((impact) => (
          <li key={impact}>{impact}</li>
        ))}
      </ul>
      {children}
      {pending && (
        <p className={styles.pendingNote} role="status">
          Đang gửi yêu cầu. Đóng hộp này không hủy thao tác; kết quả sẽ hiện trên trang.
        </p>
      )}
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.cancel} onClick={onClose}>
          {pending ? 'Đóng' : 'Hủy'}
        </button>
        {/* aria-disabled thay vi disabled: nut giu focus khi dang xu ly, khong roi focus ve body. */}
        <button
          type="button"
          className={tone === 'danger' ? styles.danger : styles.primary}
          aria-disabled={pending}
          aria-busy={pending}
          onClick={() => {
            if (!pending) onConfirm();
          }}
        >
          {pending ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
