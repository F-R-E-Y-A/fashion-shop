export interface VariantForCart {
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string;
  price: string;
  imageUrl: string | null;
  isActive: boolean;
}

export interface CartItemResponse {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  variantLabel: string;
  price: string;
  imageUrl: string | null;
  quantity: number;
  isActive: boolean;
  subtotal: string;
  availableQuantity: number | null;
  availability: 'AVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'INACTIVE' | 'UNKNOWN';
  isSelected: boolean;
  canCheckout: boolean;
}

export interface CartResponse {
  cartId: string;
  items: CartItemResponse[];
  /** Tong tien tinh theo gia hien tai, khong luu cung. */
  total: string;
  itemCount: number;
  selectedItemCount: number;
  discountAmount: string;
}
