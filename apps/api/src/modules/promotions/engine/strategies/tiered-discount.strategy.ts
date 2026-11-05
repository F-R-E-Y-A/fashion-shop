import { Decimal } from 'decimal.js';

import type { DiscountCalculationResult, DiscountStrategy } from './discount-strategy.interface.js';

export interface DiscountTier {
  minAmount: number | string;
  discount: number | string;
  isPercentage?: boolean;
}

export class TieredDiscountStrategy implements DiscountStrategy {
  readonly type = 'TIERED';

  calculate(subtotal: Decimal, config: Record<string, unknown>): DiscountCalculationResult {
    const rawTiers = (config.tiers as DiscountTier[]) ?? [];
    if (rawTiers.length === 0) {
      return {
        discountAmount: new Decimal(0),
        finalAmount: subtotal,
      };
    }

    const sortedTiers = [...rawTiers].sort((a, b) =>
      new Decimal(b.minAmount).comparedTo(new Decimal(a.minAmount)),
    );

    const matchedTier = sortedTiers.find((tier) => subtotal.gte(new Decimal(tier.minAmount)));

    if (!matchedTier) {
      return {
        discountAmount: new Decimal(0),
        finalAmount: subtotal,
        breakdown: {
          matchedTier: null,
          nextTier: sortedTiers[sortedTiers.length - 1],
        },
      };
    }

    let calculatedDiscount: Decimal;
    if (matchedTier.isPercentage) {
      calculatedDiscount = subtotal.mul(new Decimal(matchedTier.discount)).div(100).round();
    } else {
      calculatedDiscount = new Decimal(matchedTier.discount);
    }

    const discountAmount = Decimal.min(calculatedDiscount, subtotal);
    const finalAmount = subtotal.sub(discountAmount);

    return {
      discountAmount,
      finalAmount,
      breakdown: {
        matchedTier,
      },
    };
  }
}
