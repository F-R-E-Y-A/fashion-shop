import { addToCart } from '../api/cart.api.js';
import { useCartMutation } from '../api/useCartMutation.js';

export function AddToCartButton({
  variantId,
  availableQuantity,
  quantity = 1,
  className,
}: {
  variantId?: string;
  availableQuantity?: number | null;
  /** So luong them mot lan (bo chon so luong o trang chi tiet); mac dinh 1 nhu truoc. */
  quantity?: number;
  className?: string;
}) {
  const mutation = useCartMutation((id: string) => addToCart(id, quantity));
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!variantId || availableQuantity === 0 || mutation.isPending}
        onClick={() => {
          if (variantId) mutation.mutate(variantId);
        }}
      >
        {availableQuantity === 0 ? 'Hết hàng' : mutation.isPending ? 'Đang thêm…' : 'Thêm vào giỏ'}
      </button>
      <div style={{ minHeight: '2.4em' }}>
        {!variantId && <small>Chọn phân loại để thêm vào giỏ.</small>}
        {variantId && (availableQuantity === null || availableQuantity === undefined) && (
          <small>Chưa cập nhật tồn kho. Thêm vào giỏ chưa giữ hàng.</small>
        )}
        {mutation.isSuccess && mutation.variables === variantId && (
          <p role="status" style={{ margin: '4px 0 0' }}>
            Đã thêm vào giỏ.
          </p>
        )}
        {mutation.error && (
          <p role="alert" style={{ margin: '4px 0 0' }}>
            {mutation.error.message}
          </p>
        )}
      </div>
    </>
  );
}
