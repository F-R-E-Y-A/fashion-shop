import { Decimal } from 'decimal.js';

import type { DiscountCalculationResult, DiscountStrategy } from './discount-strategy.interface.js';

export class FixedAmountDiscountStrategy implements DiscountStrategy {
  readonly type = 'FIXED_AMOUNT';

  calculate(subtotal: Decimal, config: Record<string, unknown>): DiscountCalculationResult {
    const value = new Decimal((config.discountValue as string | number) ?? 0);
    const discountAmount = Decimal.min(value, subtotal);
    const finalAmount = subtotal.sub(discountAmount);

    return {
      discountAmount,
      finalAmount,
      breakdown: {
        fixedAmount: value.toString(),
      },
    };
  }
}
