import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';

import { formatPrice } from '@/core';
import { BestPromotionBanner, PromotionField, useAppliedPromotion } from '@/features/promotions';

import {
  Cart,
  cartKeys,
  clearCart,
  getCart,
  removeCartItem,
  selectCartItem,
  updateCartItem,
} from '../api/cart.api.js';
import { useCartMutation } from '../api/useCartMutation.js';
import styles from './CartPage.module.css';

function CartItemRow({
  item,
  onUpdate,
  onRemove,
  onSelect,
  busy,
}: {
  item: Cart['items'][number];
  onUpdate: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onSelect: (variantId: string, selected: boolean) => void;
  busy: boolean;
}) {
  return (
    <article className={styles.item}>
      <input
        type="checkbox"
        aria-label={`Chọn ${item.name}`}
        checked={item.isSelected}
        disabled={busy || (!item.canCheckout && !item.isSelected)}
        onChange={(event) => onSelect(item.variantId, event.target.checked)}
      />
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className={styles.image} />
      ) : (
        <span className={styles.image} aria-hidden="true" />
      )}
      <div className={styles.info}>
        <h3 className={styles.name}>
          <Link to={`/san-pham/${item.productSlug}`}>{item.name}</Link>
        </h3>
        <p className={styles.variant}>{item.variantLabel}</p>
        <p className={styles.unitPrice}>{formatPrice(item.price)} / sản phẩm</p>
        {item.availability !== 'AVAILABLE' && (
          <p className={styles.inactive}>
            {item.availability === 'INACTIVE'
              ? 'Sản phẩm đã ngừng bán.'
              : item.availability === 'OUT_OF_STOCK'
                ? 'Hết hàng — sản phẩm được giữ lại trong giỏ.'
                : item.availability === 'UNKNOWN'
                  ? 'Chưa cập nhật tồn kho.'
                  : `Chỉ còn ${item.availableQuantity} sản phẩm. Vui lòng giảm số lượng trước khi mua.`}
          </p>
        )}
      </div>
      <div className={styles.metrics}>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label={`Giảm số lượng ${item.name}`}
            onClick={() => onUpdate(item.variantId, item.quantity - 1)}
            disabled={busy || item.quantity <= 1}
          >
            −
          </button>
          <span aria-label={`Số lượng ${item.name}`}>{item.quantity}</span>
          <button
            type="button"
            aria-label={`Tăng số lượng ${item.name}`}
            onClick={() => onUpdate(item.variantId, item.quantity + 1)}
            disabled={
              busy ||
              !item.isActive ||
              item.availableQuantity === 0 ||
              (item.availableQuantity !== null && item.quantity >= item.availableQuantity)
            }
          >
            +
          </button>
        </div>
        <p className={styles.lineTotal}>{formatPrice(item.subtotal)}</p>
        <button
          type="button"
          className={styles.remove}
          disabled={busy}
          onClick={() => onRemove(item.variantId)}
          aria-label={`Bỏ ${item.name} khỏi giỏ`}
        >
          Bỏ món
        </button>
      </div>
    </article>
  );
}

export function CartPage() {
  const navigate = useNavigate();
  const { applied, applyEvaluatedPromotion } = useAppliedPromotion();
  const {
    data: cart,
    isLoading,
    isError,
  } = useQuery({
    queryKey: cartKeys.current(),
    queryFn: getCart,
  });

  const updateMut = useCartMutation(
    ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      updateCartItem(variantId, quantity),
  );
  const selectMut = useCartMutation(
    ({ variantId, selected }: { variantId: string; selected: boolean }) =>
      selectCartItem(variantId, selected),
  );
  const removeMut = useCartMutation(removeCartItem);
  const clearMut = useCartMutation(clearCart);
  const busy =
    updateMut.isPending || selectMut.isPending || removeMut.isPending || clearMut.isPending;
  const error = updateMut.error ?? selectMut.error ?? removeMut.error ?? clearMut.error;

  if (isLoading) return <p className="state">Đang tải giỏ hàng…</p>;
  if (isError && !cart)
    return <p className="state state--error">Không thể tải giỏ hàng. Thử lại sau.</p>;

  if (!cart || cart.items.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          {/* Ky hieu thuong hieu lam diem nhan trang rong, cung bo nhan dien voi header. */}
          <img src="/images/brand/freya/symbol-espresso.png" alt="" width={64} height={64} />
          <h1 className={styles.emptyTitle}>Giỏ của bạn đang trống</h1>
          <p className={styles.emptyText}>Khám phá bộ sưu tập mới và chọn vài món bạn yêu thích.</p>
          <Link to="/" className={styles.cta}>
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Giỏ hàng</p>
      <h1 className={styles.title}>
        Giỏ của bạn{cart.itemCount > 0 ? ` · ${cart.itemCount} sản phẩm` : ''}
      </h1>
      <p className={styles.subtotalNote}>
        Giá và tồn kho được cập nhật tự động. Thêm vào giỏ chưa giữ hàng.
      </p>
      {isError && (
        <p role="alert">Chưa cập nhật được giỏ. Giá và tồn kho đang hiển thị có thể đã thay đổi.</p>
      )}
      {error && <p role="alert">{error.message}</p>}

      <div className={styles.grid}>
        <div className={styles.list}>
          {cart.items.map((item) => (
            <CartItemRow
              key={item.variantId}
              item={item}
              busy={busy}
              onSelect={(variantId, selected) => selectMut.mutate({ variantId, selected })}
              onUpdate={(variantId, qty) => updateMut.mutate({ variantId, quantity: qty })}
              onRemove={(variantId) => removeMut.mutate(variantId)}
            />
          ))}
        </div>

        <aside className={styles.summary} aria-label="Tóm tắt giỏ hàng">
          <BestPromotionBanner
            subtotal={cart.total}
            itemCount={cart.selectedItemCount}
            items={cart.items
              .filter((item) => item.isSelected)
              .map((item) => ({
                variantId: item.variantId,
                price: item.price,
                quantity: item.quantity,
              }))}
            appliedPromotionId={applied?.kind === 'PROMOTION' ? applied.id : undefined}
            onApplyBest={applyEvaluatedPromotion}
          />
          <h2 className={styles.summaryTitle}>Tóm tắt</h2>
          <p className={styles.row}>
            <span>Tạm tính · {cart.selectedItemCount} sản phẩm đã chọn</span>
            <span>{formatPrice(cart.total)}</span>
          </p>
          <p className={styles.row}>
            <span>Phí vận chuyển</span>
            <span>Tính khi thanh toán</span>
          </p>
          <PromotionField subtotal={cart.total} />
          <p className={styles.row}>
            <span>Giảm giá</span>
            <span>
              {applied && parseFloat(applied.discountAmount) > 0
                ? `-${formatPrice(applied.discountAmount)}`
                : formatPrice(cart.discountAmount)}
            </span>
          </p>
          <p className={styles.total}>
            <span>Tiền hàng đã chọn</span>
            <strong>
              {formatPrice(
                String(
                  applied && parseFloat(applied.discountAmount) > 0
                    ? Math.max(
                        0,
                        (parseFloat(cart.total) || 0) - parseFloat(applied.discountAmount),
                      )
                    : cart.total,
                ),
              )}
            </strong>
          </p>
          <button
            type="button"
            className={styles.checkout}
            disabled={
              busy ||
              isError ||
              cart.selectedItemCount === 0 ||
              cart.items.some((item) => item.isSelected && !item.canCheckout)
            }
            onClick={() => navigate('/thanh-toan')}
          >
            Tiến hành đặt hàng
          </button>
          <Link className={styles.ordersLink} to="/tai-khoan/don-hang">
            Đơn hàng của tôi
          </Link>
          <button
            type="button"
            className={styles.clear}
            onClick={() => clearMut.mutate()}
            disabled={busy}
          >
            Xóa toàn bộ giỏ
          </button>
        </aside>
      </div>
    </div>
  );
}
