import { addToCart } from '../api/cart.api.js';
import { useCartMutation } from '../api/useCartMutation.js';

export function AddToCartButton({
  variantId,
  availableQuantity,
  className,
}: {
  variantId?: string;
  availableQuantity?: number | null;
  className?: string;
}) {
  const mutation = useCartMutation((id: string) => addToCart(id));
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
      {!variantId && <small>Chọn phân loại để thêm vào giỏ.</small>}
      {variantId && (availableQuantity === null || availableQuantity === undefined) && (
        <small>Chưa cập nhật tồn kho. Thêm vào giỏ chưa giữ hàng.</small>
      )}
      {mutation.isSuccess && mutation.variables === variantId && (
        <p role="status">Đã thêm vào giỏ.</p>
      )}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
    </>
  );
}
