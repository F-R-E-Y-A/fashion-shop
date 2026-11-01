import { apiDel, apiGet, apiPatch, apiPost } from '@/core';

export interface CartItem {
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

export interface Cart {
  cartId: string;
  items: CartItem[];
  total: string;
  itemCount: number;
  selectedItemCount: number;
  discountAmount: string;
}

/** Lay headers dinh danh gio hang cho khach vang lai tu localStorage (neu co). */
function cartHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const guestToken = localStorage.getItem('guestToken');
  if (guestToken) headers['x-guest-token'] = guestToken;
  return headers;
}

/** Dam bao luon co guestToken cho khach vang lai. */
function ensureGuestToken(): void {
  if (!localStorage.getItem('guestToken')) {
    localStorage.setItem('guestToken', crypto.randomUUID());
  }
}

export const cartKeys = {
  all: ['cart'] as const,
  current: () => [...cartKeys.all, 'current'] as const,
};

export const getCart = ({ signal }: { signal?: AbortSignal } = {}): Promise<Cart> => {
  ensureGuestToken();
  return apiGet<Cart>('/cart', {}, { headers: cartHeaders(), signal });
};

export const addToCart = (variantId: string, quantity = 1): Promise<Cart> => {
  ensureGuestToken();
  return apiPost<Cart>('/cart/items', { variantId, quantity }, cartHeaders());
};

export const updateCartItem = (variantId: string, quantity: number): Promise<Cart> =>
  apiPatch<Cart>(`/cart/items/${variantId}`, { quantity }, cartHeaders());

export const selectCartItem = (variantId: string, isSelected: boolean): Promise<Cart> =>
  apiPatch<Cart>(`/cart/items/${variantId}`, { isSelected }, cartHeaders());

export const removeCartItem = (variantId: string): Promise<Cart> =>
  apiDel<Cart>(`/cart/items/${variantId}`, cartHeaders());

export const clearCart = (): Promise<{ ok: boolean }> =>
  apiDel<{ ok: boolean }>('/cart', cartHeaders());

export const mergeCart = (guestToken?: string): Promise<Cart | null> => {
  const token = guestToken ?? localStorage.getItem('guestToken');
  if (!token) return Promise.resolve(null);
  return apiPost<Cart>('/cart/merge', undefined, { 'x-guest-token': token });
};
