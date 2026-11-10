import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { DiscountType } from '../promotions.types.js';
import type { PromotionContext } from './promotion.context.js';
import type { PromotionCandidate } from './promotion-evaluator.service.js';
import { PromotionEvaluatorService } from './promotion-evaluator.service.js';

describe('PromotionEvaluatorService', () => {
  const service = new PromotionEvaluatorService();

  const context: PromotionContext = {
    userId: 'user-vip',
    subtotal: new Decimal(600000),
    items: [
      {
        variantId: 'v-1',
        categorySlug: 'ao-khoac',
        price: new Decimal(600000),
        quantity: 1,
      },
    ],
    now: new Date('2026-10-27T14:00:00Z'),
    customerMetrics: {
      orderCount: 5,
      totalSpent: new Decimal(3000000),
      isNewCustomer: false,
      isVipCustomer: true,
    },
  };

  it('đánh giá thành công chương trình thỏa mãn cả minOrder và conditions', async () => {
    const candidate: PromotionCandidate = {
      id: 'promo-1',
      name: 'Ưu đãi áo khoác mùa đông',
      discountType: DiscountType.PERCENTAGE,
      discountValue: '10',
      minOrderAmount: '500000',
      conditions: {
        type: 'AND',
        rules: [
          { type: 'CATEGORY', categorySlugs: ['ao-khoac'] },
          { type: 'CUSTOMER_SEGMENT', segment: 'VIP_CUSTOMER' },
        ],
      },
    };

    const result = await service.evaluateCandidate(candidate, context);
    expect(result.eligible).toBe(true);
    expect(result.evaluated).toBeDefined();
    expect(result.evaluated?.discountAmount.toString()).toBe('60000');
    expect(result.evaluated?.finalAmount.toString()).toBe('540000');
  });

  it('từ chối khi không đạt giá trị đơn tối thiểu minOrderAmount', async () => {
    const candidate: PromotionCandidate = {
      id: 'promo-2',
      name: 'Ưu đãi đơn hàng lớn',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: '100000',
      minOrderAmount: '1000000',
    };

    const result = await service.evaluateCandidate(candidate, context);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('1000000đ');
  });

  it('từ chối khi điều kiện conditions không thỏa mãn', async () => {
    const candidate: PromotionCandidate = {
      id: 'promo-3',
      name: 'Ưu đãi khách hàng mới',
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: '50000',
      conditions: {
        type: 'CUSTOMER_SEGMENT',
        segment: 'NEW_CUSTOMER',
      },
    };

    const result = await service.evaluateCandidate(candidate, context);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('khách hàng mới');
  });
});
