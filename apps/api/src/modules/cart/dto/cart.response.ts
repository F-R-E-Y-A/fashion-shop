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
  name: string;
  variantLabel: string;
  price: string;
  imageUrl: string | null;
  quantity: number;
  isActive: boolean;
  subtotal: string;
}

export interface CartResponse {
  cartId: string;
  items: CartItemResponse[];
  /** Tong tien tinh theo gia hien tai, khong luu cung. */
  total: string;
  itemCount: number;
}
