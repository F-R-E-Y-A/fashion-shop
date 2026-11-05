import { Decimal } from 'decimal.js';

export interface CartItemContext {
  variantId: string;
  categorySlug?: string;
  price: Decimal;
  quantity: number;
}

export interface CustomerMetrics {
  orderCount: number;
  totalSpent: Decimal;
  isNewCustomer: boolean;
  isVipCustomer: boolean;
}

export interface PromotionContext {
  userId?: string;
  subtotal: Decimal;
  items?: CartItemContext[];
  now: Date;
  customerMetrics?: CustomerMetrics;
}
