import { Decimal } from 'decimal.js';

import type { PromotionContext } from '../promotion.context.js';

export interface DiscountCalculationResult {
  discountAmount: Decimal;
  finalAmount: Decimal;
  breakdown?: Record<string, unknown>;
}

export interface DiscountStrategy {
  readonly type: string;
  calculate(
    subtotal: Decimal,
    config: Record<string, unknown>,
    context?: PromotionContext,
  ): DiscountCalculationResult;
}
