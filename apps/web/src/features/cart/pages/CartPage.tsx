import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { formatPrice } from '@/core';

import {
  Cart,
  cartKeys,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from '../api/cart.api.js';

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
    <div className="cart-item">
      {item.imageUrl && <img src={item.imageUrl} alt={item.name} className="cart-item__img" />}
      <div className="cart-item__info">
        <p className="cart-item__name">{item.name}</p>
        <p className="cart-item__variant">{item.variantLabel}</p>
        {!item.isActive && <p className="cart-item__inactive">⚠ Sản phẩm này đã ngừng bán</p>}
      </div>
      <p className="cart-item__price">{formatPrice(item.price)} ×</p>
      <div className="cart-item__qty">
        <button
          onClick={() => onUpdate(item.variantId, item.quantity - 1)}
          disabled={item.quantity <= 1}
        >
          −
        </button>
        <span>{item.quantity}</span>
        <button onClick={() => onUpdate(item.variantId, item.quantity + 1)}>+</button>
      </div>
      <p className="cart-item__subtotal">{formatPrice(item.subtotal)}</p>
      <button className="cart-item__remove" onClick={() => onRemove(item.variantId)}>
        ✕
      </button>
    </div>
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
      <div className="cart-empty">
        <p>🛒 Giỏ hàng trống</p>
        <a href="/">Tiếp tục mua sắm</a>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <h1>Giỏ hàng ({cart.itemCount} sản phẩm)</h1>

      <div className="cart-list">
        {cart.items.map((item) => (
          <CartItemRow
            key={item.variantId}
            item={item}
            onUpdate={(variantId, qty) => updateMut.mutate({ variantId, quantity: qty })}
            onRemove={(variantId) => removeMut.mutate(variantId)}
          />
        ))}
      </div>

      <div className="cart-summary">
        <p className="cart-summary__total">
          Tạm tính: <strong>{formatPrice(cart.total)}</strong>
        </p>
        <div className="cart-summary__actions">
          <button
            className="btn btn--ghost"
            onClick={() => clearMut.mutate()}
            disabled={clearMut.isPending}
          >
            Xóa tất cả
          </button>
          <button className="btn btn--primary">Tiến hành đặt hàng →</button>
        </div>
      </div>
    </div>
  );
}
