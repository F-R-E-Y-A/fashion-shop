import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { DiscountStrategyFactory } from './factories/discount-strategy.factory.js';
import { FixedAmountDiscountStrategy } from './strategies/fixed-amount-discount.strategy.js';
import { PercentageDiscountStrategy } from './strategies/percentage-discount.strategy.js';
import { TieredDiscountStrategy } from './strategies/tiered-discount.strategy.js';

describe('Discount Strategies & Strategy Pattern', () => {
  describe('PercentageDiscountStrategy', () => {
    const strategy = new PercentageDiscountStrategy();

    it('tính toán giảm theo % không có trần', () => {
      const result = strategy.calculate(new Decimal(500000), {
        discountValue: '10',
      });
      expect(result.discountAmount.toString()).toBe('50000');
      expect(result.finalAmount.toString()).toBe('450000');
    });

    it('áp dụng trần giảm tối đa maxDiscountAmount', () => {
      const result = strategy.calculate(new Decimal(1000000), {
        discountValue: '20',
        maxDiscountAmount: '100000',
      });
      // 20% cua 1tr la 200k, nhung bi tran 100k
      expect(result.discountAmount.toString()).toBe('100000');
      expect(result.finalAmount.toString()).toBe('900000');
    });

    it('không vượt quá subtotal nếu subtotal nhỏ', () => {
      const result = strategy.calculate(new Decimal(50000), {
        discountValue: '100',
      });
      expect(result.discountAmount.toString()).toBe('50000');
      expect(result.finalAmount.toString()).toBe('0');
    });
  });

  describe('FixedAmountDiscountStrategy', () => {
    const strategy = new FixedAmountDiscountStrategy();

    it('giảm số tiền cố định thông thường', () => {
      const result = strategy.calculate(new Decimal(500000), {
        discountValue: '50000',
      });
      expect(result.discountAmount.toString()).toBe('50000');
      expect(result.finalAmount.toString()).toBe('450000');
    });

    it('chặn số tiền giảm không vượt quá giá trị đơn hàng', () => {
      const result = strategy.calculate(new Decimal(30000), {
        discountValue: '50000',
      });
      expect(result.discountAmount.toString()).toBe('30000');
      expect(result.finalAmount.toString()).toBe('0');
    });
  });

  describe('TieredDiscountStrategy (Dynamic progressive tiers)', () => {
    const strategy = new TieredDiscountStrategy();
    const tieredConfig = {
      tiers: [
        { minAmount: 300000, discount: 30000 },
        { minAmount: 600000, discount: 70000 },
        { minAmount: 1000000, discount: 150000 },
      ],
    };

    it('không đạt mốc thấp nhất: giảm 0đ', () => {
      const result = strategy.calculate(new Decimal(200000), tieredConfig);
      expect(result.discountAmount.toString()).toBe('0');
      expect(result.finalAmount.toString()).toBe('200000');
    });

    it('đạt mốc 1 (>= 300k, < 600k): giảm 30.000đ', () => {
      const result = strategy.calculate(new Decimal(450000), tieredConfig);
      expect(result.discountAmount.toString()).toBe('30000');
      expect(result.finalAmount.toString()).toBe('420000');
    });

    it('đạt mốc 2 (>= 600k, < 1M): giảm 70.000đ', () => {
      const result = strategy.calculate(new Decimal(700000), tieredConfig);
      expect(result.discountAmount.toString()).toBe('70000');
      expect(result.finalAmount.toString()).toBe('630000');
    });

    it('đạt mốc cao nhất (>= 1M): giảm 150.000đ', () => {
      const result = strategy.calculate(new Decimal(1200000), tieredConfig);
      expect(result.discountAmount.toString()).toBe('150000');
      expect(result.finalAmount.toString()).toBe('1050000');
    });
  });

  describe('DiscountStrategyFactory', () => {
    it('trả về đúng Strategy tương ứng loại', () => {
      expect(DiscountStrategyFactory.getStrategy('PERCENTAGE')).toBeInstanceOf(
        PercentageDiscountStrategy,
      );
      expect(DiscountStrategyFactory.getStrategy('FIXED_AMOUNT')).toBeInstanceOf(
        FixedAmountDiscountStrategy,
      );
      expect(DiscountStrategyFactory.getStrategy('TIERED')).toBeInstanceOf(TieredDiscountStrategy);
    });
  });
});
