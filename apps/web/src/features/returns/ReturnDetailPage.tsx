import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { classifyRequestError, formatPrice } from '@/core';
import { ConfirmDialog, ErrorNote, Lightbox, Loading } from '@/ui';

import {
  formatReturnDate,
  REASON_LABELS,
  REFUND_METHOD_TEXT,
  type ReturnRequest,
  type ReturnStatus,
  STATUS_LABELS,
} from './returns.api.js';
import styles from './Returns.module.css';
import { useCancelReturn, useReturn } from './use-returns.js';

interface Step {
  label: string;
  at: string | null;
  state: 'done' | 'current' | 'todo' | 'bad';
}

const FLOW: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'COMPLETED'];
const FLOW_LABELS = ['Đã gửi', 'Shop đã duyệt', 'Shop đã nhận hàng', 'Đã hoàn tiền'];

/** Duong thang Gui -> Duyet -> Nhan hang -> Hoan tien; bi tu choi hay da huy thi dung lai o buoc do. */
function stepsOf(request: ReturnRequest): Step[] {
  const dates = [request.createdAt, request.decidedAt, request.receivedAt, request.completedAt];
  if (request.status === 'REJECTED') {
    return [
      { label: 'Đã gửi', at: request.createdAt, state: 'done' },
      { label: 'Bị từ chối', at: request.decidedAt, state: 'bad' },
    ];
  }
  if (request.status === 'CANCELLED') {
    return [
      { label: 'Đã gửi', at: request.createdAt, state: 'done' },
      { label: 'Đã huỷ', at: null, state: 'bad' },
    ];
  }
  const current = FLOW.indexOf(request.status);
  return FLOW_LABELS.map((label, index) => ({
    label,
    at: dates[index] ?? null,
    // Buoc cuoi da xong thi khong con buoc "dang cho".
    state:
      index < current || (index === current && current === FLOW.length - 1)
        ? 'done'
        : index === current
          ? 'current'
          : 'todo',
  }));
}

function cancelMessage(error: unknown): string {
  return classifyRequestError(error, 'mutation') === 'conflict'
    ? 'Shop vừa xử lý yêu cầu này nên không huỷ được nữa. Trang đã tải lại.'
    : 'Không huỷ được yêu cầu. Kiểm tra kết nối rồi thử lại.';
}

/** /tai-khoan/tra-hang/:id: tien trinh, san pham, so tien hoan va nut huy khi shop chua duyet. */
export function ReturnDetailPage() {
  const { id = '' } = useParams();
  const result = useReturn(id);
  const cancel = useCancelReturn();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewing, setViewing] = useState<number | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const request = result.data;

  // Huy xong thi nut huy bien mat: dua focus ve tieu de, khong de roi ve body.
  useEffect(() => {
    if (notice && request && !request.canCancel) titleRef.current?.focus();
  }, [notice, request]);

  return (
    <section className={styles.page} aria-labelledby="return-title">
      <Link className={styles.back} to="/tai-khoan/tra-hang">
        ← Yêu cầu trả hàng của tôi
      </Link>
      {result.isPending && <Loading label="Đang tải yêu cầu trả hàng…" />}
      {result.isError && (
        <ErrorNote
          label={
            classifyRequestError(result.error, 'detail') === 'not-found'
              ? 'Không tìm thấy yêu cầu trả hàng này.'
              : 'Không tải được yêu cầu trả hàng.'
          }
          onRetry={() => void result.refetch()}
        />
      )}
      {request && (
        <>
          <header className={styles.detailHead}>
            <h2 id="return-title" ref={titleRef} tabIndex={-1} className={styles.detailTitle}>
              Trả hàng đơn {request.orderCode}
            </h2>
            <span className={styles.status} data-status={request.status}>
              {STATUS_LABELS[request.status]}
            </span>
          </header>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}

          <ol className={styles.timeline} aria-label="Tiến trình trả hàng">
            {stepsOf(request).map((step) => (
              <li
                key={step.label}
                className={styles.step}
                data-state={step.state}
                aria-current={step.state === 'current' ? 'step' : undefined}
              >
                <span className={styles.stepLabel}>{step.label}</span>
                {step.at && <span className={styles.muted}>{formatReturnDate(step.at)}</span>}
              </li>
            ))}
          </ol>

          {request.decisionNote && (
            <p className={request.status === 'REJECTED' ? styles.noteDanger : styles.note}>
              {request.status === 'REJECTED' ? 'Lý do từ chối: ' : 'Ghi chú của shop: '}
              {request.decisionNote}
            </p>
          )}

          <h3 className={styles.sectionTitle}>Sản phẩm trả</h3>
          <ul className={styles.list}>
            {request.items.map((item) => (
              <li key={item.orderItemId} className={styles.productLine}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className={styles.productImage} aria-hidden="true" />
                )}
                <div>
                  <p className={styles.productName}>{item.name}</p>
                  <p className={styles.muted}>
                    {item.variantLabel ? `${item.variantLabel} · ` : ''}
                    {formatPrice(item.unitPrice)} × {item.quantity}
                  </p>
                </div>
                <p className={styles.amount}>{formatPrice(item.refundAmount)}</p>
              </li>
            ))}
          </ul>

          <dl className={styles.totals}>
            {Number(request.refundShipping) > 0 && (
              <div>
                <dt>Hoàn phí vận chuyển</dt>
                <dd>{formatPrice(request.refundShipping)}</dd>
              </div>
            )}
            <div className={styles.totalRow}>
              <dt>Tổng hoàn</dt>
              <dd>{formatPrice(request.refundAmount)}</dd>
            </div>
          </dl>
          <p className={styles.muted}>
            {REFUND_METHOD_TEXT[request.refundMethod]}{' '}
            {request.shopPaysReturnShipping
              ? 'Shop chịu phí gửi trả.'
              : 'Bạn chịu phí gửi trả với lý do này.'}
          </p>

          <h3 className={styles.sectionTitle}>Lý do</h3>
          <p>{REASON_LABELS[request.reasonCode]}</p>
          {request.description && <p className={styles.content}>{request.description}</p>}
          {request.media.length > 0 && (
            <ul className={styles.photos} aria-label="Ảnh đã gửi">
              {request.media.map((media, index) => (
                <li key={media.url}>
                  <button
                    type="button"
                    className={styles.photo}
                    aria-label={`Xem ảnh ${index + 1}`}
                    onClick={() => setViewing(index)}
                  >
                    <img src={media.url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.actions}>
            <Link className={styles.link} to={`/don-hang/${request.orderId}`}>
              Xem đơn hàng
            </Link>
            {request.canCancel && (
              <button
                ref={cancelButton}
                type="button"
                className={styles.secondary}
                onClick={() => {
                  cancel.reset();
                  setConfirming(true);
                }}
              >
                Huỷ yêu cầu
              </button>
            )}
          </div>
        </>
      )}

      {viewing !== null && request && (
        <Lightbox
          images={request.media.map((media, index) => ({
            url: media.url,
            alt: `Ảnh ${index + 1}`,
          }))}
          index={viewing}
          onClose={() => setViewing(null)}
          onNavigate={setViewing}
        />
      )}
      {confirming && request && (
        <ConfirmDialog
          open
          title="Huỷ yêu cầu trả hàng?"
          subject={`Đơn ${request.orderCode}`}
          impacts={[
            'Yêu cầu bị huỷ; nếu đơn còn trong hạn bạn vẫn gửi lại được.',
            'Chỉ huỷ được khi shop chưa duyệt.',
          ]}
          confirmLabel="Huỷ yêu cầu"
          pendingLabel="Đang huỷ…"
          tone="danger"
          pending={cancel.isPending}
          returnFocusRef={cancelButton}
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            cancel.mutate(request.id, {
              onSuccess: () => {
                setConfirming(false);
                setNotice('Đã huỷ yêu cầu trả hàng.');
              },
            })
          }
        >
          {cancel.isError && (
            <p className={styles.error} role="alert">
              {cancelMessage(cancel.error)}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
