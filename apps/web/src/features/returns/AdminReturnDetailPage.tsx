import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { classifyRequestError, formatDateTime, formatPrice, requestErrorCode } from '@/core';
import {
  adminAccessGeneration,
  AdminForbidden,
  SessionChangedError,
  shouldRetryAdminQuery,
  useAdminForbidden,
  useAuth,
} from '@/features/account';
import { ConfirmDialog, ErrorNote, Loading } from '@/ui';

import styles from './AdminReturns.module.css';
import {
  type AdminReturn,
  REASON_LABELS,
  returnKeys,
  STATUS_LABELS,
  STATUS_TONES,
  TRANSFER_REFERENCE,
} from './returns.api.js';

type ActionKind = 'approve' | 'reject' | 'receive' | 'refund';

const NOTE_MAX = 500;
const GATEWAY_NAMES: Record<string, string> = {
  VNPAY: 'VNPAY',
  MOMO: 'MoMo',
  MOMO_ATM: 'MoMo (thẻ)',
  COD: 'Tiền mặt khi nhận hàng (COD)',
};
const REFUND_STATUS: Record<string, string> = {
  SUCCEEDED: 'Đã hoàn',
  PENDING: 'Đang chờ cổng xác nhận',
  FAILED: 'Hoàn không thành công',
};
const DONE: Record<ActionKind, string> = {
  approve: 'Đã duyệt yêu cầu trả hàng.',
  reject: 'Đã từ chối yêu cầu trả hàng.',
  receive: 'Đã ghi nhận hàng về kho; số lượng trả đã cộng vào tồn.',
  refund: 'Đã hoàn tiền; yêu cầu hoàn tất.',
};

const PENDING_REFUND_TEXT =
  'Lệnh hoàn đã gửi nhưng cổng chưa xác nhận. Lệnh hoàn chờ đối soát ở trang đơn hàng; yêu cầu giữ trạng thái "Shop đã nhận hàng" cho tới khi cổng trả lời.';

function actionError(error: unknown): { text: string; reload: boolean } {
  const code = requestErrorCode(error);
  // Ca 409 va 503: lenh hoan truoc chua ro ket qua tu cong, giu nguyen trang thai de doi soat.
  if (code === 'REFUND_PENDING') {
    return {
      text: 'Lệnh hoàn chờ đối soát ở trang đơn hàng. Đối soát xong rồi bấm hoàn tiền lại; yêu cầu vẫn giữ trạng thái hiện tại.',
      reload: true,
    };
  }
  if (code === 'RETURN_STATE_CHANGED') {
    return {
      text: 'Yêu cầu vừa đổi trạng thái ở nơi khác. Trang đã tải lại, hãy kiểm tra rồi thao tác tiếp.',
      reload: true,
    };
  }
  if (classifyRequestError(error, 'mutation') === 'unknown') {
    return {
      text: 'Chưa xác định được kết quả: thao tác có thể đã được thực hiện. Trang đã tải lại, kiểm tra trạng thái trước khi thử tiếp.',
      reload: true,
    };
  }
  return {
    text: error instanceof Error && error.message ? error.message : 'Máy chủ từ chối thao tác.',
    reload: false,
  };
}

/** /admin/returns/:id: moi thu ve mot yeu cau va cac thao tac hop le voi trang thai hien tai. */
export function AdminReturnDetailPage() {
  const { user, getSessionEpoch } = useAuth();
  const { id = '' } = useParams();
  return <AdminReturnDetail key={`${user?.id}:${getSessionEpoch()}:${id}`} />;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    // Clipboard co the vang (http, trinh duyet cu): van boi den duoc nho user-select.
    void navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className={styles.value}>{value}</span>
        <button
          type="button"
          className={styles.copy}
          onClick={copy}
          aria-label={`Sao chép ${label.toLowerCase()}`}
        >
          {copied ? 'Đã sao chép' : 'Sao chép'}
        </button>
      </dd>
    </div>
  );
}

function AdminReturnDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user, authenticatedRequest: request, getSessionEpoch } = useAuth();
  const actorId = user?.id ?? '';
  const { forbidden, markForbidden, guardQuery } = useAdminForbidden(actorId, getSessionEpoch);
  const client = useQueryClient();
  const key = returnKeys.adminDetail(actorId, id);
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      guardQuery(() => request<AdminReturn>(`/admin/returns/${id}`, { signal })),
    enabled: Boolean(actorId) && !forbidden,
    retry: shouldRetryAdminQuery,
  });
  const [dialog, setDialog] = useState<ActionKind | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [message, setMessage] = useState<{ text: string; warning: boolean } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  // Nut mo hop thuong bien mat sau khi doi trang thai: dua focus ve thong bao ket qua, khong de roi ve body.
  useEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);

  const action = useMutation({
    mutationFn: async (variables: {
      kind: ActionKind;
      body: object;
      epoch: number;
      access: number;
    }) => {
      if (
        getSessionEpoch() !== variables.epoch ||
        adminAccessGeneration(client, actorId) !== variables.access
      ) {
        throw new SessionChangedError();
      }
      return request<AdminReturn>(`/admin/returns/${id}/${variables.kind}`, {
        method: 'POST',
        body: variables.body,
      });
    },
    retry: 0,
    onSuccess: (data, variables) => {
      if (
        getSessionEpoch() !== variables.epoch ||
        adminAccessGeneration(client, actorId) !== variables.access
      ) {
        return;
      }
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: [...returnKeys.admin(actorId), 'list'] });
      setDialog(null);
      // Cong co the chua tra loi ngay: lenh hoan da di nhung yeu cau van RECEIVED, cho doi soat.
      const unsettled = variables.kind === 'refund' && data.status !== 'COMPLETED';
      setMessage(
        unsettled
          ? { text: PENDING_REFUND_TEXT, warning: true }
          : { text: DONE[variables.kind], warning: false },
      );
    },
    onError: (error) => {
      if (error instanceof SessionChangedError) return;
      if (classifyRequestError(error, 'mutation') === 'forbidden') {
        markForbidden();
        return;
      }
      const { text: failure, reload } = actionError(error);
      if (reload) {
        setDialog(null);
        setMessage({ text: failure, warning: true });
        void client.invalidateQueries({ queryKey: returnKeys.admin(actorId) });
      }
    },
  });

  if (forbidden) return <AdminForbidden />;

  const data = result.data;
  const open = (kind: ActionKind, event: { currentTarget: HTMLElement }) => {
    opener.current = event.currentTarget;
    setText('');
    setProblem('');
    action.reset();
    setDialog(kind);
  };
  const confirm = () => {
    if (!dialog || !data) return;
    const note = text.trim();
    let body: object = {};
    if (dialog === 'approve') body = note ? { note } : {};
    if (dialog === 'reject') {
      if (!note) {
        setProblem('Nhập lý do từ chối: khách sẽ thấy lý do này.');
        return;
      }
      body = { note };
    }
    if (dialog === 'refund' && data.refundMethod === 'BANK_TRANSFER') {
      if (!TRANSFER_REFERENCE.test(note)) {
        setProblem(
          'Mã giao dịch gồm 4 đến 64 ký tự: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.',
        );
        return;
      }
      body = { transferReference: note };
    }
    setProblem('');
    action.mutate({
      kind: dialog,
      body,
      epoch: getSessionEpoch(),
      access: adminAccessGeneration(client, actorId),
    });
  };

  const bank = data?.refundMethod === 'BANK_TRANSFER';
  const dialogConfig: Record<
    ActionKind,
    { title: string; impacts: string[]; confirm: string; pending: string; danger: boolean }
  > = {
    approve: {
      title: 'Duyệt yêu cầu trả hàng',
      impacts: [
        'Khách được báo là shop đã duyệt và gửi hàng về.',
        'Kho chưa đổi cho tới khi bạn bấm "Đã nhận hàng".',
      ],
      confirm: 'Duyệt',
      pending: 'Đang duyệt…',
      danger: false,
    },
    reject: {
      title: 'Từ chối yêu cầu trả hàng',
      impacts: [
        'Khách thấy lý do bạn ghi.',
        'Yêu cầu kết thúc; khách có thể gửi yêu cầu mới nếu còn hạn.',
      ],
      confirm: 'Từ chối',
      pending: 'Đang lưu…',
      danger: true,
    },
    receive: {
      title: 'Xác nhận đã nhận hàng',
      impacts: [
        'Kho cộng lại đúng số lượng khách trả, mỗi biến thể một lần.',
        'Không hoàn tác được; sau bước này mới hoàn tiền được.',
      ],
      confirm: 'Đã nhận hàng',
      pending: 'Đang ghi nhận…',
      danger: false,
    },
    refund: {
      title: 'Hoàn tiền cho khách',
      impacts: data
        ? bank
          ? [
              `Chuyển khoản ${formatPrice(data.refundAmount)} vào tài khoản khách đã nhập, rồi điền mã giao dịch.`,
              'Số tài khoản của khách bị xoá khi yêu cầu hoàn tất.',
            ]
          : [
              `Hoàn ${formatPrice(data.refundAmount)} về ${GATEWAY_NAMES[data.paymentGateway ?? ''] ?? 'cổng đã thanh toán'}; thời gian tiền về tuỳ ngân hàng hoặc ví.`,
              'Không hoàn tác được.',
            ]
        : [],
      confirm: 'Hoàn tiền',
      pending: 'Đang hoàn…',
      danger: true,
    },
  };
  const config = dialog ? dialogConfig[dialog] : null;
  const needsText = dialog === 'approve' || dialog === 'reject' || (dialog === 'refund' && bank);
  // Loi can tai lai da dong hop va hien o khung thong bao tren trang; loi con lai hien trong hop.
  const failure =
    action.isError && !(action.error instanceof SessionChangedError)
      ? actionError(action.error)
      : null;
  const serverError = failure && !failure.reload ? failure.text : '';

  return (
    <div className={styles.page}>
      <Link className={styles.back} to={{ pathname: '/admin/returns', search: location.search }}>
        ← Danh sách trả hàng
      </Link>
      {result.isPending && <Loading label="Đang tải yêu cầu trả hàng…" />}
      {result.isError && (
        <ErrorNote
          label={
            classifyRequestError(result.error, 'detail') === 'not-found'
              ? 'Không tìm thấy yêu cầu trả hàng này.'
              : 'Không tải được yêu cầu trả hàng. Kiểm tra kết nối rồi thử lại.'
          }
          onRetry={() => void result.refetch()}
        />
      )}
      {data && (
        <>
          <header className={styles.header}>
            <div className={styles.headLine}>
              <h1 className={styles.title}>Trả hàng đơn {data.orderCode}</h1>
              <span className={styles.badge} data-tone={STATUS_TONES[data.status]}>
                <span className={styles.badgeDot} aria-hidden="true" />
                {STATUS_LABELS[data.status]}
              </span>
            </div>
            <p className={styles.muted}>Gửi lúc {formatDateTime(data.createdAt)}</p>
          </header>
          {message && (
            <p
              ref={messageRef}
              tabIndex={-1}
              className={message.warning ? styles.warning : styles.notice}
              role={message.warning ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}

          <div className={styles.detailGrid}>
            <div className={styles.main}>
              <section className={styles.panel} aria-labelledby="ret-items">
                <h2 id="ret-items" className={styles.panelTitle}>
                  Sản phẩm trả
                </h2>
                <ul className={styles.lines}>
                  {data.items.map((item) => (
                    <li key={item.orderItemId} className={styles.line}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.lineImage} aria-hidden="true" />
                      )}
                      <div>
                        <p className={styles.lineName}>{item.name}</p>
                        <p className={styles.muted}>
                          {item.variantLabel ? `${item.variantLabel} · ` : ''}
                          {formatPrice(item.unitPrice)} × {item.quantity}
                        </p>
                      </div>
                      <p className={styles.numeric}>{formatPrice(item.refundAmount)}</p>
                    </li>
                  ))}
                </ul>
                {Number(data.refundShipping) > 0 && (
                  <p className={styles.total}>
                    <span>Hoàn phí vận chuyển</span>
                    <span>{formatPrice(data.refundShipping)}</span>
                  </p>
                )}
                <p className={styles.total}>
                  <span>Tổng hoàn</span>
                  <span>{formatPrice(data.refundAmount)}</span>
                </p>
              </section>

              <section className={styles.panel} aria-labelledby="ret-reason">
                <h2 id="ret-reason" className={styles.panelTitle}>
                  Lý do và ảnh
                </h2>
                <p className={styles.text}>
                  <strong>{REASON_LABELS[data.reasonCode]}</strong>
                </p>
                {data.description ? (
                  <p className={styles.text}>{data.description}</p>
                ) : (
                  <p className={styles.muted}>Khách không ghi mô tả.</p>
                )}
                {data.media.length > 0 ? (
                  <ul className={styles.photos} aria-label="Ảnh khách gửi">
                    {data.media.map((media, index) => (
                      <li key={media.url}>
                        <a href={media.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={media.url}
                            alt={`Ảnh ${index + 1} (mở cỡ đầy đủ)`}
                            loading="lazy"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>Khách không gửi ảnh.</p>
                )}
                {data.decisionNote && (
                  <p className={styles.text}>
                    <strong>Ghi chú của shop:</strong> {data.decisionNote}
                  </p>
                )}
              </section>
            </div>

            <div className={styles.side}>
              <section className={styles.panel} aria-labelledby="ret-info">
                <h2 id="ret-info" className={styles.panelTitle}>
                  Thông tin
                </h2>
                <dl className={styles.facts}>
                  <div>
                    <dt>Khách</dt>
                    <dd>{data.customerEmail}</dd>
                  </div>
                  <div>
                    <dt>Đơn hàng</dt>
                    <dd>
                      <Link to={`/admin/orders/${data.orderId}`}>{data.orderCode}</Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Cách hoàn tiền</dt>
                    <dd>
                      {bank
                        ? 'Chuyển khoản thủ công (đơn COD)'
                        : `Về ${GATEWAY_NAMES[data.paymentGateway ?? ''] ?? 'cổng đã thanh toán'}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Phí gửi trả</dt>
                    <dd>{data.shopPaysReturnShipping ? 'Shop chịu' : 'Khách chịu'}</dd>
                  </div>
                  {data.decidedAt && (
                    <div>
                      <dt>Duyệt hoặc từ chối lúc</dt>
                      <dd>{formatDateTime(data.decidedAt)}</dd>
                    </div>
                  )}
                  {data.receivedAt && (
                    <div>
                      <dt>Nhận hàng lúc</dt>
                      <dd>{formatDateTime(data.receivedAt)}</dd>
                    </div>
                  )}
                  {data.completedAt && (
                    <div>
                      <dt>Hoàn tất lúc</dt>
                      <dd>{formatDateTime(data.completedAt)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {data.refundAccount && (
                <section className={styles.panel} aria-labelledby="ret-account">
                  <h2 id="ret-account" className={styles.panelTitle}>
                    Tài khoản nhận tiền
                  </h2>
                  <dl className={styles.account}>
                    <CopyRow label="Ngân hàng" value={data.refundAccount.bankName} />
                    <CopyRow label="Số tài khoản" value={data.refundAccount.accountNumber} />
                    <CopyRow label="Chủ tài khoản" value={data.refundAccount.accountHolder} />
                  </dl>
                </section>
              )}

              {data.refund && (
                <section className={styles.panel} aria-labelledby="ret-refund">
                  <h2 id="ret-refund" className={styles.panelTitle}>
                    Lệnh hoàn tiền
                  </h2>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{REFUND_STATUS[data.refund.status] ?? data.refund.status}</dd>
                    </div>
                    <div>
                      <dt>Số tiền</dt>
                      <dd>{formatPrice(data.refund.amount)}</dd>
                    </div>
                    {data.refund.reference && (
                      <div>
                        <dt>Mã tham chiếu</dt>
                        <dd className={styles.mono}>{data.refund.reference}</dd>
                      </div>
                    )}
                  </dl>
                </section>
              )}

              {(data.status === 'REQUESTED' ||
                data.status === 'APPROVED' ||
                data.status === 'RECEIVED') && (
                <section className={styles.panel} aria-labelledby="ret-actions">
                  <h2 id="ret-actions" className={styles.panelTitle}>
                    Xử lý
                  </h2>
                  <div className={styles.actions}>
                    {data.status === 'REQUESTED' && (
                      <>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={(event) => open('approve', event)}
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={(event) => open('reject', event)}
                        >
                          Từ chối
                        </button>
                      </>
                    )}
                    {data.status === 'APPROVED' && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={(event) => open('receive', event)}
                      >
                        Đã nhận hàng
                      </button>
                    )}
                    {data.status === 'RECEIVED' && (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={(event) => open('refund', event)}
                      >
                        Hoàn tiền
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}

      {config && dialog && data && (
        <ConfirmDialog
          open
          title={config.title}
          subject={`Đơn ${data.orderCode} · ${data.customerEmail}`}
          impacts={config.impacts}
          confirmLabel={config.confirm}
          pendingLabel={config.pending}
          tone={config.danger ? 'danger' : 'primary'}
          pending={action.isPending}
          returnFocusRef={opener}
          onClose={() => setDialog(null)}
          onConfirm={confirm}
        >
          {needsText && (
            <label className={styles.field}>
              <span>
                {dialog === 'approve'
                  ? 'Ghi chú cho khách (không bắt buộc)'
                  : dialog === 'reject'
                    ? 'Lý do từ chối (khách sẽ thấy)'
                    : 'Mã giao dịch chuyển khoản'}
              </span>
              {dialog === 'refund' ? (
                <input
                  value={text}
                  maxLength={64}
                  autoComplete="off"
                  onChange={(event) => setText(event.target.value)}
                />
              ) : (
                <textarea
                  value={text}
                  maxLength={NOTE_MAX}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </label>
          )}
          {(problem || serverError) && (
            <p className={styles.error} role="alert">
              {problem || serverError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
