import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ReturnRequestDialog } from './ReturnRequestDialog.js';
import { formatReturnDate, type ReturnEligibility } from './returns.api.js';
import styles from './Returns.module.css';
import { useReturnEligibility } from './use-returns.js';

/**
 * Loi moi tra hang tren trang don (UC-14.1/AC9). Dat cho don da giao hoac da hoan: don da hoan van can
 * lien ket toi yeu cau tra da xong. Don khac khong co gi de hoi. Loi hay dang tai thi im lang, khong chan trang don.
 */
export function ReturnOrderPrompt({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const eligibility = useReturnEligibility(orderId);
  const navigate = useNavigate();
  // Giu ban dieu kien luc mo hop: sau khi gui, dieu kien tai lai se doi thanh RETURN_EXISTS.
  const [dialog, setDialog] = useState<ReturnEligibility | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const existing = useRef<HTMLAnchorElement>(null);
  const wasOpen = useRef(false);
  const data = eligibility.data;

  // Gui xong hay gap RETURN_EXISTS: nut da bien mat, dua focus sang lien ket "Xem yeu cau" thay vi body.
  useEffect(() => {
    if (wasOpen.current && !dialog && !opener.current?.isConnected) existing.current?.focus();
    wasOpen.current = dialog !== null;
  }, [dialog, data?.eligible]);

  if (!data) return null;

  return (
    <>
      {data.eligible && (
        <div className={styles.prompt}>
          <button
            ref={opener}
            type="button"
            className={styles.primary}
            onClick={() => setDialog(data)}
          >
            Yêu cầu trả hàng
          </button>
          {data.deadline && (
            <p className={styles.muted}>Hạn trả: {formatReturnDate(data.deadline)}</p>
          )}
        </div>
      )}
      {!data.eligible && data.existingReturnId && (
        <p className={styles.prompt}>
          <Link
            ref={existing}
            className={styles.link}
            to={`/tai-khoan/tra-hang/${data.existingReturnId}`}
          >
            Xem yêu cầu trả hàng
          </Link>
        </p>
      )}
      {!data.eligible && data.blocker === 'WINDOW_CLOSED' && (
        <p className={`${styles.prompt} ${styles.muted}`}>
          Đơn đã quá hạn {data.windowDays} ngày để trả hàng.
        </p>
      )}
      {dialog && (
        <ReturnRequestDialog
          orderId={orderId}
          orderCode={orderCode}
          eligibility={dialog}
          returnFocusRef={opener}
          onClose={() => setDialog(null)}
          onCreated={(created) => navigate(`/tai-khoan/tra-hang/${created.id}`)}
        />
      )}
    </>
  );
}
