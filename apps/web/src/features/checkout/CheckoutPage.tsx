import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, formatPrice } from '@/core';
import { addressKeys, listAddresses, useAuth } from '@/features/account';

import styles from './Checkout.module.css';
import {
  checkoutKey,
  checkoutKeys,
  type GatewayCode,
  type OrderView,
  type Quote,
} from './types.js';

const gatewayHints: Record<GatewayCode, string> = {
  VNPAY: 'Thẻ ATM nội địa, thẻ quốc tế hoặc quét mã VNPAY-QR.',
  MOMO: 'Thanh toán bằng ví MoMo.',
};

export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Giỏ hàng', 'Xác nhận', 'Thanh toán'];
  return (
    <ol className={styles.steps} aria-label="Các bước đặt hàng">
      {steps.map((step, index) => (
        <li
          key={step}
          data-step={index + 1}
          aria-current={index + 1 === current ? 'step' : undefined}
          className={
            index + 1 === current ? styles.stepCurrent : index + 1 < current ? styles.stepDone : ''
          }
        >
          {step}
        </li>
      ))}
    </ol>
  );
}

export function CheckoutPage() {
  const { user, authenticatedRequest: request } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [preferredGateway, setGateway] = useState<GatewayCode | ''>('');
  const addresses = useQuery({
    queryKey: addressKeys.list(user!.id),
    queryFn: () => listAddresses(request),
  });
  const addressId =
    selected || addresses.data?.find((a) => a.isDefault)?.id || addresses.data?.[0]?.id || '';
  const key = checkoutKeys.preview(user!.id, addressId);
  const preview = useQuery({
    queryKey: key,
    queryFn: () => request<Quote>('/checkout/preview', { method: 'POST', body: { addressId } }),
    enabled: !!addressId,
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
  const submit = useMutation({
    mutationKey: checkoutKeys.all,
    mutationFn: () =>
      request<OrderView>('/checkout/orders', {
        method: 'POST',
        body: {
          addressId,
          gateway,
          fingerprint: preview.data!.fingerprint,
          idempotencyKey: checkoutKey(user!.id, preview.data!.fingerprint, gateway),
        },
      }),
    onSuccess: (order) => {
      navigate(`/don-hang/${order.id}`, { replace: true });
      const url = order.payments.find((p) => p.checkoutUrl)?.checkoutUrl;
      if (url) window.location.assign(url);
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const quote = preview.data;
  const offeredGateways = quote?.gateways ?? [
    { code: 'VNPAY' as const, label: 'VNPAY', configured: quote?.paymentConfigured ?? false },
  ];
  const gateways = offeredGateways.filter((item) => item.configured || item.code === 'VNPAY');
  const gateway = preferredGateway || gateways.find((item) => item.configured)?.code || 'VNPAY';
  const selectedGateway = gateways.find((item) => item.code === gateway);
  const count = quote?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  return (
    <div className={styles.page}>
      <Link className={styles.back} to="/gio-hang">
        ← Quay lại giỏ hàng
      </Link>
      <p className={styles.eyebrow}>Thanh toán</p>
      <h1 className={styles.title}>Xác nhận đơn hàng</h1>
      <p className={styles.lead}>
        Giá và tồn được kiểm tra lại trước khi đặt. Hàng chỉ được giữ khi xác nhận sang thanh toán.
      </p>
      <CheckoutSteps current={2} />
      <div className={styles.grid}>
        <div className={styles.main}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Địa chỉ giao hàng</h2>
              <Link className={styles.sectionLink} to="/tai-khoan/dia-chi">
                Thêm / sửa địa chỉ
              </Link>
            </div>
            {addresses.isPending && (
              <p className={styles.muted} role="status">
                Đang tải địa chỉ…
              </p>
            )}
            {addresses.error && (
              <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                {addresses.error.message}
              </p>
            )}
            {addresses.data?.length === 0 && (
              <p className={styles.notice}>Thêm địa chỉ giao hàng để tiếp tục.</p>
            )}
            <div className={styles.options}>
              {addresses.data?.map((address) => (
                <label className={styles.option} key={address.id}>
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === address.id}
                    onChange={() => setSelected(address.id)}
                    disabled={submit.isPending}
                  />
                  <span>
                    <span className={styles.optionTitle}>
                      {address.recipientName} · {address.phone}
                      {address.isDefault && <span className={styles.tag}>MẶC ĐỊNH</span>}
                    </span>
                    <span className={styles.optionText}>
                      {address.detailAddress}, {address.administrativeArea.name},{' '}
                      {address.administrativeArea.province?.name}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {preview.isFetching && !!addressId && !quote && (
            <p className={styles.muted} role="status">
              Đang cập nhật giá và phí vận chuyển…
            </p>
          )}
          {preview.error && !submit.error && (
            <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
              {preview.error.message}{' '}
              {preview.error instanceof ApiError &&
              preview.error.body.code === 'PENDING_ORDER_EXISTS' ? (
                <Link to="/tai-khoan/don-hang">Xem đơn đang chờ</Link>
              ) : (
                <Link to="/gio-hang">Về giỏ hàng để kiểm tra</Link>
              )}
            </p>
          )}

          {quote && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Sản phẩm đã chọn</h2>
                <span className={styles.muted}>{count} món</span>
              </div>
              <ul className={styles.items}>
                {quote.items.map((item) => (
                  <li className={styles.item} key={item.variantId}>
                    {item.imageUrl ? (
                      <img className={styles.thumb} src={item.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.thumb} aria-hidden="true" />
                    )}
                    <div>
                      <p className={styles.itemName}>
                        {item.productSlug ? (
                          <Link to={`/san-pham/${item.productSlug}`}>{item.name}</Link>
                        ) : (
                          item.name
                        )}
                      </p>
                      <p className={styles.itemMeta}>
                        {item.variantLabel} · {formatPrice(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <p className={styles.itemTotal}>
                      {formatPrice(item.subtotal ?? String(Number(item.price) * item.quantity))}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {quote && (
            <section className={styles.section}>
              <fieldset className={`${styles.options} ${styles.fieldset}`}>
                <legend className={`${styles.sectionTitle} ${styles.legend}`}>
                  Phương thức thanh toán
                </legend>
                {gateways.map((item) => (
                  <label className={styles.option} key={item.code}>
                    <input
                      type="radio"
                      name="payment-gateway"
                      aria-label={item.label}
                      value={item.code}
                      checked={gateway === item.code}
                      disabled={submit.isPending || !item.configured}
                      onChange={() => setGateway(item.code)}
                    />
                    <span>
                      <span className={styles.optionTitle}>
                        {item.label}
                        {!item.configured && ' — chưa sẵn sàng'}
                      </span>
                      <span className={styles.optionText}>{gatewayHints[item.code]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className={styles.muted}>
                Thanh toán qua {selectedGateway?.label} trong{' '}
                {quote.payMinutes ?? quote.holdMinutes} phút; hàng được giữ {quote.holdMinutes} phút
                để chờ cổng xác nhận. Tải lại trang hoặc thử lại không gia hạn.
              </p>
            </section>
          )}
        </div>

        {quote && (
          <aside className={styles.summary} aria-label="Tóm tắt đơn hàng">
            <h2 className={styles.summaryTitle}>Tóm tắt đơn hàng</h2>
            <p className={styles.row}>
              <span>Tiền hàng ({count} món)</span>
              <span>{formatPrice(quote.subtotalAmount)}</span>
            </p>
            <label className={styles.promotion}>
              Khuyến mãi
              <input
                aria-label="Khuyến mãi"
                value=""
                readOnly
                disabled
                placeholder="Chưa áp dụng"
              />
            </label>
            <p className={styles.row}>
              <span>Giảm giá</span>
              <span>{formatPrice(quote.discountAmount)}</span>
            </p>
            <p className={styles.row}>
              <span>Phí vận chuyển</span>
              <span>{formatPrice(quote.shippingFeeAmount)}</span>
            </p>
            <p className={styles.summaryNote}>
              Phí giao hàng nội địa 30.000đ; miễn phí từ 500.000đ tiền hàng sau giảm giá.
            </p>
            <p className={styles.total}>
              <span>Tổng thanh toán</span>
              <strong>{formatPrice(quote.totalAmount)}</strong>
            </p>
            {quote.pendingOrder && (
              <p className={styles.notice} role="alert">
                Bạn còn đơn {quote.pendingOrder.orderCode} đang chờ thanh toán. Mỗi lần chỉ giữ hàng
                cho một đơn:{' '}
                <Link to={`/don-hang/${quote.pendingOrder.id}`}>tiếp tục hoặc hủy đơn đó</Link>{' '}
                trước khi đặt đơn mới.
              </p>
            )}
            {!selectedGateway?.configured && (
              <p className={styles.notice} role="status">
                Cổng {selectedGateway?.label} chưa sẵn sàng. Bạn có thể xem đơn dự kiến và quay lại
                thanh toán sau.
              </p>
            )}
            {submit.error && (
              <p className={`${styles.notice} ${styles.noticeDanger}`} role="alert">
                {submit.error.message} Kiểm tra lại thông tin rồi xác nhận lại.
              </p>
            )}
            <button
              className={styles.cta}
              disabled={
                !selectedGateway?.configured ||
                !!quote.pendingOrder ||
                preview.isFetching ||
                preview.isError ||
                submit.isPending
              }
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? 'Đang tạo đơn…' : `Xác nhận và sang ${selectedGateway?.label}`}
            </button>
            {preview.isFetching && (
              <p className={styles.summaryNote} role="status">
                Đang cập nhật giá và phí vận chuyển…
              </p>
            )}
            <div className={styles.linkRow}>
              <Link to="/tai-khoan/don-hang">Xem đơn hàng của tôi</Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
