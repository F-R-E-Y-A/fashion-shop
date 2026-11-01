import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { formatDateTime, formatPrice, shouldRetryRequest } from '@/core';
import { useAuth } from '@/features/account';
import { ConfirmDialog, ErrorNote, Loading } from '@/ui';

import { orderBadges, orderStatuses } from '../types.js';
import {
  type AdminOrder,
  adminOrderErrorText,
  adminOrderKeys,
  gatewayLabel,
  orderTones,
  paymentLabels,
  type PaymentLedger,
} from './admin-orders.api.js';
import styles from './AdminOrders.module.css';

type Dialog =
  | {
      kind: 'confirmCod' | 'startProcessing' | 'cancelRefund' | 'markDelivered' | 'deliveryFailed';
    }
  | { kind: 'refund' | 'resolve'; ledger: PaymentLedger };

/** /admin/orders/:id — chi tiet don va cac thao tac shop (ADR-036, ADR-038). */
export function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const { user, authenticatedRequest: request } = useAuth();
  const client = useQueryClient();
  const key = adminOrderKeys.detail(user!.id, id);
  const result = useQuery({
    queryKey: key,
    queryFn: () => request<AdminOrder>(`/admin/orders/${id}`),
    retry: shouldRetryRequest,
  });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [amount, setAmount] = useState('');
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<'SUCCEEDED' | 'FAILED'>('FAILED');
  const [notice, setNotice] = useState('');
  const action = useMutation({
    mutationFn: (current: Dialog) => {
      const post = (path: string, body?: object) =>
        request<unknown>(path, { method: 'POST', ...(body ? { body } : {}) });
      switch (current.kind) {
        case 'confirmCod':
          return post(`/admin/orders/${id}/confirm-cod`);
        case 'startProcessing':
          return post(`/admin/orders/${id}/start-processing`);
        case 'cancelRefund':
          return post(`/admin/orders/${id}/cancel-refund`, { reason: text.trim() });
        case 'markDelivered':
          return post(`/admin/orders/${id}/delivered`);
        case 'deliveryFailed':
          return post(`/admin/orders/${id}/delivery-failed`, { reason: text.trim() });
        case 'refund':
          return post(`/admin/payments/${current.ledger.paymentId}/refund`, {
            ...(amount.trim() ? { amount: amount.trim() } : {}),
            ...(text.trim() ? { reason: text.trim() } : {}),
          });
        case 'resolve':
          return post(`/admin/payments/${current.ledger.paymentId}/refund/resolve`, {
            outcome,
            note: text.trim(),
          });
      }
    },
    onSuccess: (_data, current) => {
      setNotice(DONE[current.kind]);
      setDialog(null);
    },
    // Ke ca loi (vd cong khong tra loi nhung lenh da ghi): doc lai trang thai that tu may chu.
    onSettled: () => void client.invalidateQueries({ queryKey: adminOrderKeys.all(user!.id) }),
  });
  const open = (next: Dialog) => {
    action.reset();
    setNotice('');
    setText('');
    setOutcome('FAILED');
    setAmount(next.kind === 'refund' ? (next.ledger.refundableAmount ?? '') : '');
    setDialog(next);
  };
  const order = result.data;
  const needsText =
    dialog?.kind === 'deliveryFailed' ||
    dialog?.kind === 'resolve' ||
    dialog?.kind === 'cancelRefund'
      ? !text.trim()
      : false;

  return (
    <div className={styles.page}>
      <Link className={styles.back} to="/admin/orders">
        ← Danh sách đơn
      </Link>
      {result.isPending && <Loading label="Đang tải đơn…" />}
      {result.isError && !order && (
        <ErrorNote
          label={adminOrderErrorText(result.error, 'detail')}
          onRetry={() => void result.refetch()}
        />
      )}
      {order && (
        <>
          <header className={styles.header}>
            <p className={styles.eyebrow}>Đơn hàng</p>
            <div className={styles.headingRow}>
              <h1 className={styles.title}>{order.orderCode}</h1>
              <span className={styles.badge} data-tone={orderTones[order.status]}>
                <span className={styles.badgeDot} aria-hidden="true" />
                {orderBadges[order.status] ?? order.status}
              </span>
            </div>
            <p className={styles.muted}>
              {orderStatuses[order.status] ?? order.status} · đặt lúc{' '}
              {formatDateTime(order.createdAt)}
            </p>
          </header>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {action.error && !dialog && (
            <p className={styles.notice} data-tone="error" role="alert">
              {adminOrderErrorText(action.error, 'mutation')}
            </p>
          )}

          <div className={styles.detailGrid}>
            <div className={styles.column}>
              <section className={styles.panel} aria-labelledby="ops">
                <h2 id="ops" className={styles.panelTitle}>
                  Thao tác
                </h2>
                <div className={styles.actions}>
                  {order.actions.confirmCod && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => open({ kind: 'confirmCod' })}
                    >
                      Xác nhận và giao COD
                    </button>
                  )}
                  {order.actions.startProcessing && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => open({ kind: 'startProcessing' })}
                    >
                      Bắt đầu xử lý
                    </button>
                  )}
                  {order.actions.cancelRefund && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => open({ kind: 'cancelRefund' })}
                    >
                      Hủy và hoàn tiền
                    </button>
                  )}
                  {order.actions.markDelivered && (
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => open({ kind: 'markDelivered' })}
                    >
                      {order.actions.deliveryFailed ? 'Đã giao, đã thu tiền' : 'Đã giao'}
                    </button>
                  )}
                  {order.actions.deliveryFailed && (
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => open({ kind: 'deliveryFailed' })}
                    >
                      Giao thất bại
                    </button>
                  )}
                  {order.ledgers.map((ledger) => (
                    <span key={ledger.paymentId} className={styles.actions}>
                      {ledger.refundableAmount && (
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => open({ kind: 'refund', ledger })}
                        >
                          Hoàn tiền {gatewayLabel(ledger.gateway)}
                        </button>
                      )}
                      {ledger.pendingRefund?.resolvable && (
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => open({ kind: 'resolve', ledger })}
                        >
                          Chốt lệnh hoàn
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {!hasAction(order) && (
                  <p className={styles.muted}>Không có thao tác nào cho trạng thái hiện tại.</p>
                )}
              </section>

              <section className={styles.panel} aria-labelledby="items">
                <h2 id="items" className={styles.panelTitle}>
                  Sản phẩm
                </h2>
                <ul className={styles.items}>
                  {order.items.map((item) => (
                    <li key={item.variantId}>
                      <span>
                        {item.snapshot.name}
                        <span className={styles.sub}>
                          {item.snapshot.variantLabel} · {formatPrice(item.price)} × {item.quantity}
                        </span>
                      </span>
                      <span className={styles.numeric}>
                        {formatPrice(String(Number(item.price) * item.quantity))}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className={styles.facts}>
                  <div>
                    <dt>Tiền hàng</dt>
                    <dd>{formatPrice(order.subtotalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Vận chuyển</dt>
                    <dd>{formatPrice(order.shippingFeeAmount)}</dd>
                  </div>
                  <div>
                    <dt>Tổng</dt>
                    <dd>
                      <strong>{formatPrice(order.totalAmount)}</strong>
                    </dd>
                  </div>
                </dl>
              </section>

              <section className={styles.panel} aria-labelledby="history">
                <h2 id="history" className={styles.panelTitle}>
                  Lịch sử trạng thái
                </h2>
                <ol className={styles.timeline}>
                  {order.history.map((row, index) => (
                    <li key={`${row.status}-${index}`}>
                      <span>{orderStatuses[row.status] ?? row.status}</span>
                      <span className={styles.sub}>
                        {formatDateTime(row.at)}
                        {row.actorUserId === order.userId
                          ? ' · khách'
                          : row.actorUserId
                            ? ' · quản trị'
                            : ' · hệ thống'}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <div className={styles.column}>
              <section className={styles.panel} aria-labelledby="customer">
                <h2 id="customer" className={styles.panelTitle}>
                  Khách và giao hàng
                </h2>
                <dl className={styles.facts}>
                  <div>
                    <dt>Email</dt>
                    <dd className={styles.email}>{order.customerEmail}</dd>
                  </div>
                  <div>
                    <dt>Người nhận</dt>
                    <dd>
                      {order.address.recipientName} · {order.address.phone}
                    </dd>
                  </div>
                  <div>
                    <dt>Địa chỉ</dt>
                    <dd>
                      {order.address.detailAddress}, {order.address.commune},{' '}
                      {order.address.province}
                    </dd>
                  </div>
                </dl>
              </section>

              {order.ledgers.map((ledger) => (
                <section
                  key={ledger.paymentId}
                  className={styles.panel}
                  aria-label={`Thanh toán ${gatewayLabel(ledger.gateway)}`}
                >
                  <h2 className={styles.panelTitle}>Thanh toán {gatewayLabel(ledger.gateway)}</h2>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Trạng thái</dt>
                      <dd>{paymentLabels[ledger.status] ?? ledger.status}</dd>
                    </div>
                    <div>
                      <dt>Số tiền</dt>
                      <dd>{formatPrice(ledger.amount)}</dd>
                    </div>
                    <div>
                      <dt>Đã hoàn</dt>
                      <dd>{formatPrice(ledger.refundedAmount)}</dd>
                    </div>
                  </dl>
                  {ledger.refunds.length > 0 && (
                    <ul className={styles.items} aria-label="Các lần hoàn">
                      {ledger.refunds.map((refund) => (
                        <li key={refund.id}>
                          <span>
                            Hoàn {formatPrice(refund.amount)}
                            <span className={styles.sub}>
                              {formatDateTime(refund.at)}
                              {refund.reason ? ` · ${refund.reason}` : ''}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {ledger.pendingRefund && (
                    <p className={styles.notice} data-tone="warning" role="status">
                      Lệnh hoàn{' '}
                      {ledger.pendingRefund.amount ? formatPrice(ledger.pendingRefund.amount) : ''}{' '}
                      gửi lúc {formatDateTime(ledger.pendingRefund.createdAt)} chưa có kết quả
                      {ledger.pendingRefund.lastError
                        ? `: ${ledger.pendingRefund.lastError}`
                        : '.'}{' '}
                      {ledger.pendingRefund.resolvable
                        ? 'Đối chiếu trên trang quản trị của cổng rồi chốt kết quả.'
                        : 'Cổng có thể vẫn đang xử lý; chờ ít phút trước khi chốt tay.'}
                    </p>
                  )}
                </section>
              ))}
            </div>
          </div>

          {dialog && (
            <ConfirmDialog
              open
              tone={TONE[dialog.kind]}
              title={TITLE[dialog.kind]}
              subject={`Đơn ${order.orderCode} · ${formatPrice(order.totalAmount)}`}
              impacts={impacts(dialog, order)}
              confirmLabel={TITLE[dialog.kind]}
              pendingLabel="Đang xử lý…"
              pending={action.isPending}
              onClose={() => setDialog(null)}
              onConfirm={() => {
                if (!needsText) action.mutate(dialog);
              }}
            >
              {dialog.kind === 'refund' && (
                <label className={styles.field}>
                  <span>Số tiền hoàn (tối đa {formatPrice(dialog.ledger.refundableAmount!)})</span>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              )}
              {dialog.kind === 'resolve' && (
                <fieldset className={styles.choices}>
                  <legend>Kết quả trên cổng</legend>
                  <label>
                    <input
                      type="radio"
                      name="outcome"
                      checked={outcome === 'FAILED'}
                      onChange={() => setOutcome('FAILED')}
                    />{' '}
                    Cổng chưa hoàn (đóng lệnh, được hoàn lại)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="outcome"
                      checked={outcome === 'SUCCEEDED'}
                      onChange={() => setOutcome('SUCCEEDED')}
                    />{' '}
                    Cổng đã hoàn (ghi sổ hoàn)
                  </label>
                </fieldset>
              )}
              {(dialog.kind === 'refund' ||
                dialog.kind === 'resolve' ||
                dialog.kind === 'cancelRefund' ||
                dialog.kind === 'deliveryFailed') && (
                <label className={styles.field}>
                  <span>
                    {dialog.kind === 'refund'
                      ? 'Lý do (không bắt buộc)'
                      : dialog.kind === 'resolve'
                        ? 'Ghi chú đối chiếu (bắt buộc)'
                        : dialog.kind === 'cancelRefund'
                          ? 'Lý do hủy (bắt buộc)'
                          : 'Lý do giao thất bại (bắt buộc)'}
                  </span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>
              )}
              {needsText && <p className={styles.muted}>Nhập nội dung trước khi xác nhận.</p>}
              {action.error && (
                <p className={styles.notice} data-tone="error" role="alert">
                  {adminOrderErrorText(action.error, 'mutation')}
                </p>
              )}
            </ConfirmDialog>
          )}
        </>
      )}
    </div>
  );
}

const hasAction = (order: AdminOrder) =>
  Object.values(order.actions).some(Boolean) ||
  order.ledgers.some((ledger) => ledger.refundableAmount || ledger.pendingRefund?.resolvable);

const TITLE: Record<Dialog['kind'], string> = {
  confirmCod: 'Xác nhận và giao COD',
  startProcessing: 'Bắt đầu xử lý',
  cancelRefund: 'Hủy và hoàn tiền',
  markDelivered: 'Đánh dấu đã giao',
  deliveryFailed: 'Ghi giao thất bại',
  refund: 'Hoàn tiền',
  resolve: 'Chốt lệnh hoàn',
};
const TONE: Record<Dialog['kind'], 'danger' | 'primary'> = {
  confirmCod: 'primary',
  startProcessing: 'primary',
  cancelRefund: 'danger',
  markDelivered: 'primary',
  deliveryFailed: 'danger',
  refund: 'danger',
  resolve: 'primary',
};
const DONE: Record<Dialog['kind'], string> = {
  confirmCod: 'Đã xác nhận đơn COD và chốt kho.',
  startProcessing: 'Đơn chuyển sang đang xử lý.',
  cancelRefund: 'Đã hủy đơn, hàng về kho. Kiểm tra kết quả hoàn bên dưới.',
  markDelivered: 'Đã ghi nhận giao hàng.',
  deliveryFailed: 'Đã ghi giao thất bại, hàng trả về kho.',
  refund: 'Cổng đã xác nhận hoàn tiền.',
  resolve: 'Đã chốt lệnh hoàn.',
};

function impacts(dialog: Dialog, order: AdminOrder): string[] {
  switch (dialog.kind) {
    case 'confirmCod':
      return [
        'Đã gọi khách xác nhận đơn.',
        'Kho bị trừ, đơn không còn tự hủy sau 3 ngày; khách không tự hủy được nữa.',
      ];
    case 'startProcessing':
      return ['Khách không còn tự hủy và nhận hoàn tiền tự động được nữa.'];
    case 'cancelRefund':
      return [
        'Hàng được cộng lại vào kho, đơn hủy.',
        `Hoàn toàn bộ ${formatPrice(order.totalAmount)} qua cổng; không hoàn tác được. Cổng không xác nhận thì lệnh chờ chốt ở tab Cần xử lý.`,
      ];
    case 'markDelivered':
      return order.actions.deliveryFailed
        ? [`Ghi nhận đã thu ${formatPrice(order.totalAmount)} tiền mặt.`, 'Đơn chuyển Đã giao.']
        : ['Đơn chuyển Đã giao.'];
    case 'deliveryFailed':
      return [
        'Hàng được cộng lại vào kho.',
        'Đơn hủy và tính một lần giao thất bại cho tài khoản (đủ 2 lần thì khách mất quyền COD).',
      ];
    case 'refund':
      return [
        `Gọi cổng ${gatewayLabel(dialog.ledger.gateway)} hoàn tiền; không hoàn tác được.`,
        'Không tự trả kho — hàng đã giao trả lại nhập kho qua luồng đổi trả.',
      ];
    case 'resolve':
      return [
        'Chỉ chốt sau khi đã đối chiếu trên trang quản trị của cổng.',
        'Chốt sai có thể làm hoàn trùng hoặc ghi thiếu sổ hoàn.',
      ];
  }
}
