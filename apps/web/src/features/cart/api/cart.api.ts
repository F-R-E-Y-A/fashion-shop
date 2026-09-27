import { apiDel, apiGet, apiPatch, apiPost } from '@/core';

export interface CartItem {
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

export interface Cart {
  cartId: string;
  items: CartItem[];
  total: string;
  itemCount: number;
}

/** Lay headers dinh danh gio hang tu localStorage. */
function cartHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const userId = localStorage.getItem('userId');
  const guestToken = localStorage.getItem('guestToken');
  if (userId) headers['x-user-id'] = userId;
  if (guestToken) headers['x-guest-token'] = guestToken;
  return headers;
}

/** Dam bao luon co guestToken khi chua dang nhap. */
function ensureGuestToken(): void {
  if (!localStorage.getItem('userId') && !localStorage.getItem('guestToken')) {
    localStorage.setItem('guestToken', crypto.randomUUID());
  }
}

export const cartKeys = {
  all: ['cart'] as const,
  current: () => [...cartKeys.all, 'current'] as const,
};

export const getCart = (): Promise<Cart> => {
  ensureGuestToken();
  return apiGet<Cart>('/cart', {}, cartHeaders());
};

export const addToCart = (variantId: string, quantity = 1): Promise<Cart> => {
  ensureGuestToken();
  return apiPost<Cart>('/cart/items', { variantId, quantity }, cartHeaders());
};

export const updateCartItem = (variantId: string, quantity: number): Promise<Cart> =>
  apiPatch<Cart>(`/cart/items/${variantId}`, { quantity }, cartHeaders());

export const removeCartItem = (variantId: string): Promise<Cart> =>
  apiDel<Cart>(`/cart/items/${variantId}`, cartHeaders());

export const clearCart = (): Promise<{ ok: boolean }> =>
  apiDel<{ ok: boolean }>('/cart', cartHeaders());
