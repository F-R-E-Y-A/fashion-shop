import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { formatDateTime, formatPrice } from '@/core';
import { useAuth } from '@/features/account';
import { cartKeys } from '@/features/cart';
import { ConfirmDialog } from '@/ui';

import styles from './Checkout.module.css';
import { CheckoutSteps } from './CheckoutPage.js';
import { forgetCheckout, orderBadges, orderKeys, orderStatuses, type OrderView } from './types.js';

const paymentStatuses: Record<string, string> = {
  SUCCEEDED: 'Đã nhận tiền',
  FAILED: 'Giao dịch không thành công',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã hủy',
};
const gatewayName = (code?: string | null) =>
  code === 'MOMO' ? 'MoMo' : code === 'MOMO_ATM' ? 'MoMo (thẻ)' : code === 'COD' ? 'COD' : 'VNPAY';

export function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // The return query only locates an owned order; its response/status is never payment evidence.
  const reference = params.get('vnp_TxnRef') || params.get('orderId');
  const { user, authenticatedRequest: request } = useAuth();
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const reconciledReturn = useRef('');
  const key = orderKeys.detail(user!.id, id || reference || '');
  const result = useQuery({
    queryKey: key,
    queryFn: () =>
      request<OrderView>(
        id ? `/orders/${id}` : `/orders/by-payment/${encodeURIComponent(reference!)}`,
      ),
    enabled: !!id || !!reference,
    refetchInterval: (query) => (query.state.data?.status === 'PENDING_PAYMENT' ? 5000 : false),
    gcTime: 0,
  });
  const order = result.data;
  useEffect(() => {
    if (order && order.status !== 'PENDING_PAYMENT' && order.checkoutFingerprint)
      forgetCheckout(user!.id, order.checkoutFingerprint);
  }, [order, user]);
  const action = useMutation({
    mutationFn: (
      input:
        { name: 'payments' | 'cancel' } | { name: 'reconcile'; params?: Record<string, string> },
    ) =>
      request<OrderView>(`/orders/${order!.id}/${input.name}`, {
        method: 'POST',
        ...(input.name === 'payments' ? { body: { idempotencyKey: crypto.randomUUID() } } : {}),
        ...(input.name === 'reconcile' && input.params ? { body: { params: input.params } } : {}),
      }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: cartKeys.all });
    },
  });
  const reconcile = action.mutate;
  // Cong tra kem tham so return da ky: gui len server de xac thuc chu ky va ghi ngay
  // ket qua (huy cua khach, thanh cong), khong cho query interval cua cong.
  const returnParams = Object.fromEntries(params.entries());
  useEffect(() => {
    if (reference && order?.status === 'PENDING_PAYMENT' && reconciledReturn.current !== order.id) {
      reconciledReturn.current = order.id;
      reconcile({ name: 'reconcile', params: returnParams });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, order?.id, order?.status, reconcile]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (order?.status === 'CONFIRMED') void client.invalidateQueries({ queryKey: cartKeys.all });
  }, [order?.status, client]);
  const latestPayment = order?.payments[0];
  // Dem nguoc theo han link cong (som hon hold); thieu thi dung han giu hang.
  const deadline = latestPayment?.expiresAt ?? order?.paymentDueAt;
  const seconds = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : 0;
  const pending = order?.status === 'PENDING_PAYMENT';
  const codPending = order?.status === 'PENDING_CONFIRMATION';
  // Đối soát là việc của hệ thống: chạy ngầm khi khách quay về từ cổng, worker nền lo phần còn lại.
  // Khách không bao giờ phải tự bấm "kiểm tra thanh toán" — chuẩn Stripe/Shopee.
  const verifying = action.isPending && action.variables?.name === 'reconcile';
  // Cổng báo khách đã hủy ngay trên trang của nó (VNPAY 24; MoMo resultCode khác thành công).
  const gatewayCancelled =
    pending &&
    !verifying &&
    (params.get('vnp_ResponseCode') === '24' ||
      (params.has('resultCode') && !['0', '7000', '9000'].includes(params.get('resultCode')!)));
  const paymentUrl =
    latestPayment && ['PENDING', 'PROCESSING'].includes(latestPayment.status)
      ? latestPayment.checkoutUrl
      : null;
  const gatewayLabel = gatewayName(latestPayment?.gateway);
  const isCod = latestPayment?.gateway === 'COD';
  const refunded = Number(order?.refundedAmount ?? 0);
  // May chu tinh canCancel (ke ca huy don da tra truoc khi shop xu ly, ADR-038); du lieu cu thi suy ra.
  const canCancel = order?.canCancel ?? (pending || codPending);
  const cancelImpacts = order?.cancelRefunds
    ? [
        `Hoàn ${formatPrice(order.totalAmount)} về ${gatewayLabel}; thời gian tiền về tài khoản tùy ngân hàng hoặc ví.`,
        'Không hoàn tác được: muốn mua lại phải đặt đơn mới.',
      ]
    : [
        'Hàng đang giữ cho đơn được nhả; sản phẩm vẫn ở giỏ để đặt lại sau.',
        'Không hoàn tác được.',
      ];
  // Khach tu huy don da tra nhung cong khong hoan va lenh hoan da chot that bai: tien da tru, chua
  // hoan, don van CANCELLED. Khong duoc bao "hang da nha, dat lai tu gio" nhu don chua tra.
  const refundOwed =
    order?.status === 'CANCELLED' &&
    !order.refundPending &&
    order.payments.some((payment) => payment.status === 'SUCCEEDED' && payment.gateway !== 'COD') &&
    refunded < Number(order.totalAmount);
  return (
    <div className={styles.page}>
      <Link className={styles.back} to="/tai-khoan/don-hang">
        ← Đơn hàng của tôi
      </Link>
      <p className={styles.eyebrow}>Đơn hàng</p>
      <h1 className={styles.title}>Kết quả đặt hàng</h1>
      <p className={styles.lead}>Trạng thái đơn được cập nhật tự động từ cổng thanh toán.</p>
      {pending && <CheckoutSteps current={3} />}
      {!id && !reference && (
        <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
          Thiếu mã tham chiếu thanh toán.
        </p>
      )}
      {result.isPending && (id || reference) && (
        <p className={styles.muted} role="status">
          Đang đọc kết quả từ hệ thống…
        </p>
      )}
      {result.error && (
        <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
          {result.error.message}
        </p>
      )}
      {order && (
        <div className={styles.grid}>
          <div className={styles.main}>
            <section className={styles.statusCard} data-status={order.status}>
              <h2 className={styles.statusTitle}>{orderStatuses[order.status] || order.status}</h2>
              <p className={styles.meta}>
                <span>
                  Mã đơn <strong>{order.orderCode}</strong>
                </span>
                <span>Đặt lúc {formatDateTime(order.createdAt)}</span>
              </p>
              {pending &&
                (seconds ? (
                  <p className={styles.countdown} role="timer">
                    Thời gian thanh toán còn{' '}
                    <strong>
                      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                    </strong>
                  </p>
                ) : null)}
              {pending && (
                <p className={styles.statusText} role="status">
                  {verifying
                    ? `Đang xác nhận thanh toán với ${gatewayLabel}… Trang sẽ tự cập nhật, bạn không cần làm gì thêm.`
                    : seconds
                      ? 'Hệ thống đang chờ xác nhận từ cổng thanh toán.'
                      : 'Đã hết thời gian thanh toán. Hàng còn giữ thêm ít phút để chờ cổng xác nhận.'}
                </p>
              )}
              {order.status === 'CONFIRMED' && (
                <p className={styles.statusText}>
                  Cảm ơn bạn! Shop đã nhận tiền và sẽ chuẩn bị hàng. Bạn có thể theo dõi đơn trong
                  mục Đơn hàng của tôi.
                  {order.cancelRefunds &&
                    ' Trước khi shop bắt đầu xử lý, bạn vẫn hủy được và nhận hoàn tiền tự động.'}
                </p>
              )}
              {(order.status === 'PROCESSING' || order.status === 'SHIPPED') && (
                <p className={styles.statusText}>
                  {isCod
                    ? `Shop đã xác nhận và đang giao. Chuẩn bị ${formatPrice(order.totalAmount)} tiền mặt khi nhận hàng.`
                    : 'Shop đang đóng gói và giao hàng. Đơn không còn hủy trực tuyến được; cần hỗ trợ thì liên hệ shop kèm mã đơn.'}
                </p>
              )}
              {order.status === 'DELIVERED' && (
                <p className={styles.statusText}>
                  Đơn đã giao thành công. Cảm ơn bạn đã mua sắm tại cửa hàng!
                </p>
              )}
              {(order.status === 'REFUNDED' || order.status === 'PARTIALLY_REFUNDED') && (
                <p className={styles.statusText}>
                  Shop đã hoàn {formatPrice(String(refunded))} về {gatewayLabel}. Thời gian tiền về
                  tài khoản tùy ngân hàng hoặc ví.
                </p>
              )}
              {order.refundPending && (
                <p className={styles.notice} role="status">
                  Đang xử lý hoàn tiền với {gatewayLabel}. Shop sẽ đối soát và cập nhật đơn; bạn
                  không cần làm gì thêm.
                </p>
              )}
              {order.status === 'PAYMENT_REVIEW' && (
                <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                  Cổng đã xác nhận nhận tiền nhưng đơn cần shop đối soát do hết hạn, hủy hoặc thanh
                  toán nhiều lần. Không thanh toán lại. Liên hệ shop kèm mã đơn để xử lý hoặc hoàn
                  tiền.
                </p>
              )}
              {codPending && (
                <p className={styles.statusText} role="status">
                  Cảm ơn bạn! Shop sẽ liên hệ xác nhận và giao hàng. Thanh toán tiền mặt cho nhân
                  viên khi nhận hàng.
                </p>
              )}
              {gatewayCancelled && (
                <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                  Bạn đã hủy thanh toán trên cổng. Đơn vẫn còn giữ đến hết hạn — bấm "Thử lại thanh
                  toán" để dùng phương thức khác, hoặc "Hủy đơn".
                </p>
              )}
              {order.status === 'CANCELLED' && isCod && latestPayment?.status === 'FAILED' && (
                <p className={styles.statusText}>Đơn được hủy vì giao hàng không thành công.</p>
              )}
              {refundOwed && (
                <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                  Đơn đã hủy nhưng khoản {formatPrice(order.totalAmount)} đã thanh toán qua{' '}
                  {gatewayLabel} chưa được hoàn tự động. Shop sẽ hoàn thủ công; liên hệ shop kèm mã
                  đơn {order.orderCode} nếu cần hỗ trợ.
                </p>
              )}
              {order.status === 'CANCELLED' &&
                !order.refundPending &&
                !refundOwed &&
                refunded === 0 &&
                !(isCod && latestPayment?.status === 'FAILED') && (
                  <p className={styles.statusText}>
                    Hàng đã được nhả. Sản phẩm vẫn ở giỏ để bạn kiểm tra giá, tồn và đặt lại. Nếu đã
                    bị trừ tiền, hệ thống tự đối soát và chuyển đơn sang trạng thái cần shop xử lý;
                    liên hệ shop kèm mã đơn để được hỗ trợ sớm.
                  </p>
                )}
            </section>

            {order.shipment && (
              <section className={styles.section} aria-labelledby="shipping-tracking-title">
                <h2 id="shipping-tracking-title" className={styles.sectionTitle}>
                  Theo dõi vận chuyển
                </h2>
                <div className={styles.shippingCard}>
                  <div className={styles.shippingHeader}>
                    <span className={styles.carrierBadge}>
                      Đơn vị vận chuyển: {order.shipment.carrierName || 'GHN'} (Mô phỏng Sandbox)
                    </span>
                    <span className={styles.trackingCode}>
                      Mã vận đơn:{' '}
                      <strong>{order.shipment.trackingNumber || 'Đang cập nhật'}</strong>
                    </span>
                  </div>
                  {(() => {
                    const isFailed =
                      order.shipment.status === 'FAILED' || order.shipment.status === 'RETURNED';
                    const isDelivered =
                      order.shipment.status === 'DELIVERED' || order.status === 'DELIVERED';
                    const isInTransit =
                      order.shipment.status === 'IN_TRANSIT' || order.status === 'SHIPPED';
                    const isPending = order.shipment.status === 'PENDING';

                    const step1Status = 'done';
                    const step2Status =
                      isDelivered || isInTransit ? 'done' : isPending ? 'active' : 'pending';
                    const step3Status = isDelivered ? 'done' : isInTransit ? 'active' : 'pending';
                    const step4Status = isFailed ? 'failed' : isDelivered ? 'done' : 'pending';

                    return (
                      <div className={styles.timeline}>
                        <div className={styles.timelineStep} data-status={step1Status}>
                          <span className={styles.timelineDot}>✓</span>
                          <span className={styles.timelineLabel}>Shop đã xác nhận</span>
                        </div>
                        <div className={styles.timelineStep} data-status={step2Status}>
                          <span className={styles.timelineDot}>
                            {step2Status === 'done' ? '✓' : step2Status === 'active' ? '●' : '○'}
                          </span>
                          <span className={styles.timelineLabel}>
                            Đơn vị vận chuyển đã lấy hàng
                          </span>
                        </div>
                        <div className={styles.timelineStep} data-status={step3Status}>
                          <span className={styles.timelineDot}>
                            {step3Status === 'done' ? '✓' : step3Status === 'active' ? '●' : '○'}
                          </span>
                          <span className={styles.timelineLabel}>Đang giao đến bạn</span>
                        </div>
                        <div className={styles.timelineStep} data-status={step4Status}>
                          <span className={styles.timelineDot}>
                            {isFailed ? '✕' : step4Status === 'done' ? '✓' : '○'}
                          </span>
                          <span className={styles.timelineLabel}>
                            {isFailed ? 'Giao hàng không thành công' : 'Giao thành công'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className={styles.shippingFooter}>
                    <span className={styles.muted}>
                      Cập nhật lần cuối: {formatDateTime(order.shipment.updatedAt)}
                    </span>
                    {order.shipment.isMock || order.shipment.trackingNumber?.includes('-SBX-') ? (
                      <span className={styles.sandboxNotice}>
                        (Vận đơn thử nghiệm sandbox nội bộ phục vụ đồ án Freya, không tra cứu trên
                        cổng thực tế)
                      </span>
                    ) : (
                      order.shipment.trackingNumber && (
                        <a
                          href={
                            order.shipment.carrierName?.toUpperCase() === 'GHTK'
                              ? `https://i.ghtk.vn/${order.shipment.trackingNumber}`
                              : `https://donhang.ghn.vn/?order_code=${order.shipment.trackingNumber}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.carrierLink}
                        >
                          Xem trên website đơn vị vận chuyển ↗
                        </a>
                      )
                    )}
                  </div>
                </div>
              </section>
            )}

            {order.items.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Sản phẩm</h2>
                <ul className={styles.items}>
                  {order.items.map((item) => (
                    <li className={styles.item} key={item.variantId}>
                      {item.snapshot.imageUrl ? (
                        <img
                          className={styles.thumb}
                          src={item.snapshot.imageUrl}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className={styles.thumb} aria-hidden="true" />
                      )}
                      <div>
                        <p className={styles.itemName}>
                          <Link to={`/san-pham/${item.snapshot.productSlug}`}>
                            {item.snapshot.name}
                          </Link>
                        </p>
                        <p className={styles.itemMeta}>
                          {item.snapshot.variantLabel} · {formatPrice(item.price)} × {item.quantity}
                        </p>
                      </div>
                      <p className={styles.itemTotal}>
                        {formatPrice(String(Number(item.price) * item.quantity))}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Giao đến</h2>
              <p className={styles.address}>
                <strong>
                  {order.address.recipientName} · {order.address.phone}
                </strong>
                <br />
                {order.address.detailAddress}, {order.address.commune}, {order.address.province}
              </p>
            </section>
          </div>

          <aside className={styles.summary} aria-label="Thanh toán">
            <h2 className={styles.summaryTitle}>Thanh toán</h2>
            <p className={styles.row}>
              <span>Tiền hàng</span>
              <span>{formatPrice(order.subtotalAmount)}</span>
            </p>
            {Number(order.discountAmount) > 0 && (
              <p className={styles.row}>
                <span>Giảm giá</span>
                <span>−{formatPrice(order.discountAmount)}</span>
              </p>
            )}
            <p className={styles.row}>
              <span>Phí vận chuyển</span>
              <span>{formatPrice(order.shippingFeeAmount)}</span>
            </p>
            <p className={styles.total}>
              <span>Tổng thanh toán</span>
              <strong>{formatPrice(order.totalAmount)}</strong>
            </p>
            {refunded > 0 && (
              <p className={styles.row}>
                <span>Đã hoàn</span>
                <span>−{formatPrice(order.refundedAmount!)}</span>
              </p>
            )}
            {order.payments.length > 0 && (
              <ul className={styles.payments} aria-label="Lần thanh toán">
                {order.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      {gatewayName(payment.gateway)} · <code>{payment.reference?.slice(-8)}</code>
                    </span>
                    <span>
                      {payment.gateway === 'COD' && payment.status === 'PENDING'
                        ? 'Thu khi nhận hàng'
                        : payment.gateway === 'COD' && payment.status === 'FAILED'
                          ? 'Giao không thành công'
                          : (paymentStatuses[payment.status] ?? 'Chờ cổng xác nhận')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {action.error && (
              <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                {action.error.message}
              </p>
            )}
            <div className={styles.actions}>
              {pending && seconds > 0 && paymentUrl && (
                <a className={styles.cta} href={paymentUrl}>
                  Tiếp tục thanh toán {gatewayLabel}
                </a>
              )}
              {pending && seconds > 0 && !paymentUrl && (
                <button
                  className={styles.cta}
                  disabled={action.isPending}
                  onClick={() => action.mutate({ name: 'payments' })}
                >
                  Thử lại thanh toán
                </button>
              )}
              {order.status === 'CANCELLED' &&
                refunded === 0 &&
                !order.refundPending &&
                !refundOwed && (
                  <Link className={styles.cta} to="/gio-hang">
                    Đặt lại từ giỏ hàng
                  </Link>
                )}
              {canCancel && (
                <button
                  ref={cancelButton}
                  className={styles.textButton}
                  disabled={action.isPending}
                  onClick={() => setConfirmingCancel(true)}
                >
                  {action.isPending && action.variables?.name === 'cancel'
                    ? 'Đang hủy…'
                    : order.cancelRefunds
                      ? 'Hủy đơn và hoàn tiền'
                      : 'Hủy đơn'}
                </button>
              )}
            </div>
            {confirmingCancel && (
              <ConfirmDialog
                open
                title={order.cancelRefunds ? 'Hủy đơn và hoàn tiền?' : 'Hủy đơn này?'}
                subject={`Đơn ${order.orderCode}`}
                impacts={cancelImpacts}
                confirmLabel={order.cancelRefunds ? 'Hủy và hoàn tiền' : 'Hủy đơn'}
                pendingLabel="Đang hủy…"
                tone="danger"
                pending={action.isPending && action.variables?.name === 'cancel'}
                onConfirm={() =>
                  action.mutate({ name: 'cancel' }, { onSettled: () => setConfirmingCancel(false) })
                }
                onClose={() => setConfirmingCancel(false)}
                returnFocusRef={cancelButton}
              />
            )}
            <div className={styles.linkRow}>
              {order.status !== 'CANCELLED' && <Link to="/gio-hang">Về giỏ hàng</Link>}
              <Link to="/">Tiếp tục mua sắm</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export function OrdersPage() {
  const { user, authenticatedRequest: request } = useAuth();
  const result = useQuery({
    queryKey: orderKeys.list(user!.id),
    queryFn: () => request<OrderView[]>('/orders'),
    gcTime: 0,
  });
  return (
    <section aria-labelledby="orders-title">
      <h2 id="orders-title" className="sr-only">
        Đơn hàng của tôi
      </h2>
      {result.isPending && (
        <p className={styles.muted} role="status">
          Đang tải đơn hàng…
        </p>
      )}
      {result.error && (
        <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
          {result.error.message}
        </p>
      )}
      {result.data?.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Bạn chưa có đơn hàng</p>
          <p className={styles.muted}>Đơn đã đặt và trạng thái thanh toán sẽ hiện ở đây.</p>
          <Link className={styles.emptyCta} to="/">
            Bắt đầu mua sắm
          </Link>
        </div>
      )}
      {!!result.data?.length && (
        <ul className={styles.orders}>
          {result.data.map((order) => {
            const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const thumbs = order.items.slice(0, 3);
            return (
              <li className={styles.orderCard} key={order.id}>
                <div className={styles.thumbs} aria-hidden="true">
                  {thumbs.map((item) =>
                    item.snapshot.imageUrl ? (
                      <img
                        key={item.variantId}
                        src={item.snapshot.imageUrl}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span key={item.variantId} />
                    ),
                  )}
                  {order.items.length > 3 && <span>+{order.items.length - 3}</span>}
                </div>
                <div className={styles.orderInfo}>
                  <p className={styles.orderCode}>
                    <Link to={`/don-hang/${order.id}`}>{order.orderCode}</Link>
                  </p>
                  <p className={styles.muted}>
                    {formatDateTime(order.createdAt)} · {count} món
                  </p>
                  <span className={styles.badge} data-status={order.status}>
                    {orderBadges[order.status] || order.status}
                  </span>
                </div>
                <div className={styles.orderSide}>
                  <p className={styles.orderTotal}>{formatPrice(order.totalAmount)}</p>
                  <Link className={styles.orderLink} to={`/don-hang/${order.id}`}>
                    {order.status === 'PENDING_PAYMENT' ? 'Thanh toán' : 'Xem chi tiết'}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
