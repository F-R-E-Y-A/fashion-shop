import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { formatDateTime, formatPrice } from '@/core';
import { useAuth } from '@/features/account';
import { cartKeys } from '@/features/cart';

import styles from './Checkout.module.css';
import { CheckoutSteps } from './CheckoutPage.js';
import { forgetCheckout, orderBadges, orderStatuses, type OrderView } from './types.js';

const paymentStatuses: Record<string, string> = {
  SUCCEEDED: 'Đã nhận tiền',
  FAILED: 'Giao dịch không thành công',
  EXPIRED: 'Hết hạn',
  CANCELLED: 'Đã hủy',
};
const gatewayName = (code?: string | null) => (code === 'MOMO' ? 'MoMo' : 'VNPAY');

export function OrderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  // The return query only locates an owned order; its response/status is never payment evidence.
  const reference = params.get('vnp_TxnRef') || params.get('orderId');
  const { user, authenticatedRequest: request } = useAuth();
  const client = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const reconciledReturn = useRef('');
  const key = ['orders', user!.id, id || reference];
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
    mutationFn: (name: 'payments' | 'cancel' | 'reconcile') =>
      request<OrderView>(`/orders/${order!.id}/${name}`, {
        method: 'POST',
        ...(name === 'payments' ? { body: { idempotencyKey: crypto.randomUUID() } } : {}),
      }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: cartKeys.all });
    },
  });
  const reconcile = action.mutate;
  useEffect(() => {
    if (reference && order?.status === 'PENDING_PAYMENT' && reconciledReturn.current !== order.id) {
      reconciledReturn.current = order.id;
      reconcile('reconcile');
    }
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
  const paymentUrl =
    latestPayment && ['PENDING', 'PROCESSING'].includes(latestPayment.status)
      ? latestPayment.checkoutUrl
      : null;
  const gatewayLabel = gatewayName(latestPayment?.gateway);
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
                  {seconds
                    ? 'Hệ thống đang chờ xác nhận từ cổng thanh toán.'
                    : 'Đã hết thời gian thanh toán. Hàng còn giữ thêm ít phút để chờ cổng xác nhận.'}
                </p>
              )}
              {order.status === 'CONFIRMED' && (
                <p className={styles.statusText}>
                  Cảm ơn bạn! Shop đã nhận tiền và sẽ chuẩn bị hàng. Bạn có thể theo dõi đơn trong
                  mục Đơn hàng của tôi.
                </p>
              )}
              {order.status === 'PAYMENT_REVIEW' && (
                <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                  Cổng đã xác nhận nhận tiền nhưng đơn cần shop đối soát do hết hạn, hủy hoặc thanh
                  toán nhiều lần. Không thanh toán lại. Liên hệ shop kèm mã đơn để xử lý hoặc hoàn
                  tiền.
                </p>
              )}
              {order.status === 'CANCELLED' && (
                <p className={styles.statusText}>
                  Hàng đã được nhả. Sản phẩm vẫn ở giỏ để bạn kiểm tra giá, tồn và đặt lại. Nếu đã
                  bị trừ tiền, hãy cập nhật đối soát và liên hệ shop.
                </p>
              )}
            </section>

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
            {order.payments.length > 0 && (
              <ul className={styles.payments} aria-label="Lần thanh toán">
                {order.payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      {gatewayName(payment.gateway)} · <code>{payment.reference?.slice(-8)}</code>
                    </span>
                    <span>{paymentStatuses[payment.status] ?? 'Chờ cổng xác nhận'}</span>
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
                  onClick={() => action.mutate('payments')}
                >
                  Thử lại thanh toán
                </button>
              )}
              {order.status === 'CANCELLED' && (
                <Link className={styles.cta} to="/gio-hang">
                  Đặt lại từ giỏ hàng
                </Link>
              )}
              <button
                className={styles.ghost}
                disabled={action.isPending}
                onClick={() => action.mutate('reconcile')}
              >
                Cập nhật đối soát
              </button>
              {pending && (
                <button
                  className={styles.textButton}
                  disabled={action.isPending}
                  onClick={() => action.mutate('cancel')}
                >
                  Hủy đơn, nhả hàng
                </button>
              )}
            </div>
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
    queryKey: ['orders', user!.id, 'list'],
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
