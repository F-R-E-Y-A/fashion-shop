import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { PromotionRuleFactory } from './factories/promotion-rule.factory.js';
import type { PromotionContext } from './promotion.context.js';
import {
  CategoryRule,
  MinItemCountRule,
  MinOrderAmountRule,
} from './rules/cart-conditions.rule.js';
import { AndCompositeRule, NotRule, OrCompositeRule, PassAllRule } from './rules/composite.rule.js';
import { CustomerSegment, CustomerSegmentRule } from './rules/customer-segment.rule.js';
import { TimeWindowRule } from './rules/time-schedule.rule.js';

describe('Promotion Rules & Specification Pattern', () => {
  const baseContext: PromotionContext = {
    userId: 'user-1',
    subtotal: new Decimal(500000),
    items: [
      {
        variantId: 'var-1',
        categorySlug: 'ao-thun',
        price: new Decimal(250000),
        quantity: 2,
      },
    ],
    now: new Date('2026-10-27T12:00:00Z'),
    customerMetrics: {
      orderCount: 1,
      totalSpent: new Decimal(500000),
      isNewCustomer: false,
      isVipCustomer: false,
    },
  };

  describe('CustomerSegmentRule', () => {
    it('ALL: luôn luôn thỏa mãn', () => {
      const rule = new CustomerSegmentRule({ segment: CustomerSegment.ALL });
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(true);
      expect(rule.isSatisfiedBy({ ...baseContext, userId: undefined }).passed).toBe(true);
    });

    it('REGISTERED_ONLY: yêu cầu người dùng phải đăng nhập', () => {
      const rule = new CustomerSegmentRule({ segment: CustomerSegment.REGISTERED_ONLY });
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(true);
      const guestResult = rule.isSatisfiedBy({ ...baseContext, userId: undefined });
      expect(guestResult.passed).toBe(false);
      expect(guestResult.reason).toContain('đăng nhập');
    });

    it('NEW_CUSTOMER: chỉ cho phép khách hàng có 0 đơn hàng', () => {
      const rule = new CustomerSegmentRule({ segment: CustomerSegment.NEW_CUSTOMER });

      const newCustomerContext: PromotionContext = {
        ...baseContext,
        customerMetrics: {
          orderCount: 0,
          totalSpent: new Decimal(0),
          isNewCustomer: true,
          isVipCustomer: false,
        },
      };
      expect(rule.isSatisfiedBy(newCustomerContext).passed).toBe(true);

      const oldCustomerResult = rule.isSatisfiedBy(baseContext);
      expect(oldCustomerResult.passed).toBe(false);
      expect(oldCustomerResult.reason).toContain('khách hàng mới');
    });

    it('VIP_CUSTOMER: thỏa mãn khi đạt ngưỡng chi tiêu hoặc số đơn', () => {
      const rule = new CustomerSegmentRule({
        segment: CustomerSegment.VIP_CUSTOMER,
        minSpent: 2000000,
        minOrders: 3,
      });

      // Khách thường: không đủ
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(false);

      // Khách đạt đủ tiền chi tiêu
      const vipBySpent: PromotionContext = {
        ...baseContext,
        customerMetrics: {
          orderCount: 1,
          totalSpent: new Decimal(2500000),
          isNewCustomer: false,
          isVipCustomer: true,
        },
      };
      expect(rule.isSatisfiedBy(vipBySpent).passed).toBe(true);

      // Khách đạt đủ số đơn hàng
      const vipByOrders: PromotionContext = {
        ...baseContext,
        customerMetrics: {
          orderCount: 4,
          totalSpent: new Decimal(800000),
          isNewCustomer: false,
          isVipCustomer: true,
        },
      };
      expect(rule.isSatisfiedBy(vipByOrders).passed).toBe(true);
    });

    it('TARGETED_USERS: chỉ cho phép user ID trong danh sách chỉ định', () => {
      const rule = new CustomerSegmentRule({
        segment: CustomerSegment.TARGETED_USERS,
        userIds: ['user-special-1', 'user-special-2'],
      });

      expect(rule.isSatisfiedBy(baseContext).passed).toBe(false);

      const targetedContext: PromotionContext = {
        ...baseContext,
        userId: 'user-special-1',
      };
      expect(rule.isSatisfiedBy(targetedContext).passed).toBe(true);
    });
  });

  describe('Cart Conditions Rules', () => {
    it('MinOrderAmountRule: kiểm tra giá trị đơn hàng tối thiểu', () => {
      const rule = new MinOrderAmountRule(400000);
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(true);

      const lowContext: PromotionContext = {
        ...baseContext,
        subtotal: new Decimal(300000),
      };
      const result = rule.isSatisfiedBy(lowContext);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain('400000đ');
    });

    it('MinItemCountRule: kiểm tra tổng số lượng sản phẩm trong giỏ', () => {
      const rule = new MinItemCountRule(3);
      // baseContext has 1 item with quantity 2
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(false);

      const threeItemsContext: PromotionContext = {
        ...baseContext,
        items: [
          {
            variantId: 'var-1',
            price: new Decimal(100000),
            quantity: 3,
          },
        ],
      };
      expect(rule.isSatisfiedBy(threeItemsContext).passed).toBe(true);
    });

    it('CategoryRule: kiểm tra danh mục áp dụng', () => {
      const rule = new CategoryRule(['ao-khoac', 'quan-jean']);
      // baseContext has 'ao-thun'
      expect(rule.isSatisfiedBy(baseContext).passed).toBe(false);

      const matchingContext: PromotionContext = {
        ...baseContext,
        items: [
          {
            variantId: 'var-2',
            categorySlug: 'AO-KHOAC',
            price: new Decimal(300000),
            quantity: 1,
          },
        ],
      };
      expect(rule.isSatisfiedBy(matchingContext).passed).toBe(true);
    });

    it('TimeWindowRule: kiểm tra khung giờ và ngày trong tuần', () => {
      const fixedNow = new Date('2026-10-27T12:00:00');
      const timeContext: PromotionContext = {
        ...baseContext,
        now: fixedNow,
      };

      const rule = new TimeWindowRule({
        startHour: 10,
        endHour: 15,
        daysOfWeek: [fixedNow.getDay()],
      });
      expect(rule.isSatisfiedBy(timeContext).passed).toBe(true);

      const wrongDayRule = new TimeWindowRule({
        daysOfWeek: [(fixedNow.getDay() + 1) % 7],
      });
      expect(wrongDayRule.isSatisfiedBy(timeContext).passed).toBe(false);

      const wrongHourRule = new TimeWindowRule({
        startHour: 18,
        endHour: 21,
      });
      expect(wrongHourRule.isSatisfiedBy(timeContext).passed).toBe(false);
    });
  });

  describe('Composite Pattern (AND, OR, NOT)', () => {
    it('AndCompositeRule: chỉ thỏa mãn khi TẤT CẢ các rule con thỏa mãn', async () => {
      const andRule = new AndCompositeRule([
        new MinOrderAmountRule(300000),
        new CustomerSegmentRule({ segment: CustomerSegment.REGISTERED_ONLY }),
      ]);
      expect((await andRule.isSatisfiedBy(baseContext)).passed).toBe(true);

      const failingAndRule = new AndCompositeRule([
        new MinOrderAmountRule(300000),
        new MinOrderAmountRule(800000), // fails
      ]);
      expect((await failingAndRule.isSatisfiedBy(baseContext)).passed).toBe(false);
    });

    it('OrCompositeRule: thỏa mãn khi CÓ ÍT NHẤT MỘT rule con thỏa mãn', async () => {
      const orRule = new OrCompositeRule([
        new MinOrderAmountRule(900000), // fails
        new MinOrderAmountRule(300000), // passes
      ]);
      expect((await orRule.isSatisfiedBy(baseContext)).passed).toBe(true);

      const allFailingOrRule = new OrCompositeRule([
        new MinOrderAmountRule(800000),
        new MinOrderAmountRule(900000),
      ]);
      expect((await allFailingOrRule.isSatisfiedBy(baseContext)).passed).toBe(false);
    });

    it('NotRule: đảo ngược kết quả rule con', async () => {
      const passingRule = new MinOrderAmountRule(300000);
      const notRule = new NotRule(passingRule);
      expect((await notRule.isSatisfiedBy(baseContext)).passed).toBe(false);

      const failingRule = new MinOrderAmountRule(800000);
      const notFailingRule = new NotRule(failingRule);
      expect((await notFailingRule.isSatisfiedBy(baseContext)).passed).toBe(true);
    });
  });

  describe('PromotionRuleFactory', () => {
    it('khởi tạo PassAllRule khi conditions null hoặc rỗng', async () => {
      const rule = PromotionRuleFactory.createRule(null);
      expect(rule).toBeInstanceOf(PassAllRule);
      expect((await rule.isSatisfiedBy(baseContext)).passed).toBe(true);
    });

    it('khởi tạo cây composite lồng nhau từ JSON conditions', async () => {
      const conditions = {
        type: 'AND',
        rules: [
          { type: 'MIN_ORDER_AMOUNT', value: 200000 },
          {
            type: 'OR',
            rules: [
              { type: 'CUSTOMER_SEGMENT', segment: 'VIP_CUSTOMER', minSpent: 2000000 },
              { type: 'CATEGORY', categorySlugs: ['ao-thun'] },
            ],
          },
        ],
      };

      const rule = PromotionRuleFactory.createRule(conditions);
      expect(rule).toBeInstanceOf(AndCompositeRule);

      const result = await rule.isSatisfiedBy(baseContext);
      expect(result.passed).toBe(true);
    });
  });
});
