import { DiscountType } from '../../promotions.types.js';
import type { DiscountStrategy } from '../strategies/discount-strategy.interface.js';
import { FixedAmountDiscountStrategy } from '../strategies/fixed-amount-discount.strategy.js';
import { PercentageDiscountStrategy } from '../strategies/percentage-discount.strategy.js';
import { TieredDiscountStrategy } from '../strategies/tiered-discount.strategy.js';

export class DiscountStrategyFactory {
  private static readonly strategies = new Map<string, DiscountStrategy>([
    [DiscountType.PERCENTAGE, new PercentageDiscountStrategy()],
    [DiscountType.FIXED_AMOUNT, new FixedAmountDiscountStrategy()],
    ['TIERED', new TieredDiscountStrategy()],
  ]);

  static getStrategy(type: DiscountType | string): DiscountStrategy {
    const key = typeof type === 'string' ? type.toUpperCase() : type;
    const strategy = this.strategies.get(key);
    if (!strategy) {
      return this.strategies.get(DiscountType.PERCENTAGE)!;
    }
    return strategy;
  }
}
