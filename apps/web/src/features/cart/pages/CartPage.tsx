import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { formatPrice } from '@/core';

import {
  Cart,
  cartKeys,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../api/cart.api.js';
import styles from './CartPage.module.css';

const FREESHIP_THRESHOLD = 500_000;

function CartItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: Cart['items'][number];
  onUpdate: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
}) {
  return (
    <article className={`${styles.item} ${item.isActive ? '' : styles.itemInactive}`}>
      {item.imageUrl && <img src={item.imageUrl} alt={item.name} className={styles.image} />}
      <div className={styles.info}>
        <h3 className={styles.name}>{item.name}</h3>
        <p className={styles.variant}>{item.variantLabel}</p>
        <p className={styles.unitPrice}>{formatPrice(item.price)} / sản phẩm</p>
        {!item.isActive && (
          <p className={styles.inactive}>Sản phẩm đã ngừng bán — vui lòng bỏ khỏi giỏ</p>
        )}
      </div>
      <div className={styles.metrics}>
        <div className={styles.stepper}>
          <button
            type="button"
            aria-label={`Giảm số lượng ${item.name}`}
            onClick={() => onUpdate(item.variantId, item.quantity - 1)}
            disabled={item.quantity <= 1}
          >
            −
          </button>
          <span aria-label={`Số lượng ${item.name}`}>{item.quantity}</span>
          <button
            type="button"
            aria-label={`Tăng số lượng ${item.name}`}
            onClick={() => onUpdate(item.variantId, item.quantity + 1)}
          >
            +
          </button>
        </div>
        <p className={styles.lineTotal}>{formatPrice(item.subtotal)}</p>
        <button
          type="button"
          className={styles.remove}
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
  const qc = useQueryClient();

  const {
    data: cart,
    isLoading,
    isError,
  } = useQuery({
    queryKey: cartKeys.current(),
    queryFn: getCart,
  });

  const updateMut = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      updateCartItem(variantId, quantity),
    onSuccess: (data) => qc.setQueryData(cartKeys.current(), data),
  });

  const removeMut = useMutation({
    mutationFn: removeCartItem,
    onSuccess: (data) => qc.setQueryData(cartKeys.current(), data),
  });

  const clearMut = useMutation({
    mutationFn: clearCart,
    onSuccess: () => qc.invalidateQueries({ queryKey: cartKeys.all }),
  });

  if (isLoading) return <p className="state">Đang tải giỏ hàng…</p>;
  if (isError) return <p className="state state--error">Không thể tải giỏ hàng. Thử lại sau.</p>;

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

  // API tra tien dang chuoi (Decimal): doi so de tinh khoang cach con thieu toi moc freeship.
  const remainingForFreeship = Math.max(0, FREESHIP_THRESHOLD - Number(cart.total));

  return (
    <div className={styles.page}>
      <p className={styles.eyebrow}>Giỏ hàng</p>
      <h1 className={styles.title}>
        Giỏ của bạn{cart.itemCount > 0 ? ` · ${cart.itemCount} sản phẩm` : ''}
      </h1>
      <p className={styles.subtotalNote}>Kiểm tra món đã chọn trước khi tiến hành đặt hàng.</p>

      <div className={styles.grid}>
        <div className={styles.list}>
          {cart.items.map((item) => (
            <CartItemRow
              key={item.variantId}
              item={item}
              onUpdate={(variantId, qty) => updateMut.mutate({ variantId, quantity: qty })}
              onRemove={(variantId) => removeMut.mutate(variantId)}
            />
          ))}
        </div>

        <aside className={styles.summary} aria-label="Tóm tắt giỏ hàng">
          <h2 className={styles.summaryTitle}>Tóm tắt</h2>
          <p className={styles.row}>
            <span>Tạm tính</span>
            <span>{formatPrice(cart.total)}</span>
          </p>
          <p className={styles.row}>
            <span>Phí vận chuyển</span>
            <span>Tính khi thanh toán</span>
          </p>
          <p className={styles.freeship}>
            {remainingForFreeship > 0 ? (
              <>
                Thêm <strong>{formatPrice(String(remainingForFreeship))}</strong> để được miễn phí
                vận chuyển.
              </>
            ) : (
              <>
                Đơn của bạn được <strong>miễn phí vận chuyển</strong>.
              </>
            )}
          </p>
          <p className={styles.total}>
            <span>Tổng cộng</span>
            <strong>{formatPrice(cart.total)}</strong>
          </p>
          {/* Chưa bấm được: trang /thanh-toan mo o phan ke tiep (PH-07). De sau khi co trang
              thanh toan thi mo khoa, tranh dan vao trang chua ton tai. */}
          <button
            type="button"
            className={styles.checkout}
            disabled
            title="Trang thanh toán sắp mở"
          >
            Tiến hành đặt hàng
          </button>
          <button
            type="button"
            className={styles.clear}
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending}
          >
            Xóa toàn bộ giỏ
          </button>
        </aside>
      </div>
    </div>
  );
}
