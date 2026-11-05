import { Decimal } from 'decimal.js';

import type { DiscountCalculationResult, DiscountStrategy } from './discount-strategy.interface.js';

export class PercentageDiscountStrategy implements DiscountStrategy {
  readonly type = 'PERCENTAGE';

  calculate(subtotal: Decimal, config: Record<string, unknown>): DiscountCalculationResult {
    const value = new Decimal((config.discountValue as string | number) ?? 0);
    const maxDiscount =
      config.maxDiscountAmount !== null && config.maxDiscountAmount !== undefined
        ? new Decimal(config.maxDiscountAmount as string | number)
        : null;

    let calculated = subtotal.mul(value).div(100).round();
    if (maxDiscount && calculated.gt(maxDiscount)) {
      calculated = maxDiscount;
    }

    const discountAmount = Decimal.min(calculated, subtotal);
    const finalAmount = subtotal.sub(discountAmount);

    return {
      discountAmount,
      finalAmount,
      breakdown: {
        rate: value.toString(),
        maxDiscountAmount: maxDiscount ? maxDiscount.toString() : null,
      },
    };
  }
}
