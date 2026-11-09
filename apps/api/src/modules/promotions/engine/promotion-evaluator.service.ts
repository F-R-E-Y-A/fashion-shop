import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { DiscountType } from '../promotions.types.js';
import { DiscountStrategyFactory } from './factories/discount-strategy.factory.js';
import { PromotionRuleFactory } from './factories/promotion-rule.factory.js';
import type { PromotionContext } from './promotion.context.js';

export interface EvaluatedPromotion {
  promotionId: string;
  name: string;
  discountType: string;
  discountAmount: Decimal;
  finalAmount: Decimal;
  breakdown?: Record<string, unknown>;
}

export interface PromotionCandidate {
  id: string;
  name: string;
  discountType: DiscountType | string;
  discountValue: Decimal | string | number;
  maxDiscountAmount?: Decimal | string | number | null;
  minOrderAmount?: Decimal | string | number | null;
  conditions?: Record<string, unknown> | null;
}

@Injectable()
export class PromotionEvaluatorService {
  async evaluateCandidate(
    candidate: PromotionCandidate,
    context: PromotionContext,
  ): Promise<{ eligible: boolean; evaluated?: EvaluatedPromotion; reason?: string }> {
    if (candidate.minOrderAmount) {
      const minOrder = new Decimal(candidate.minOrderAmount);
      if (context.subtotal.lt(minOrder)) {
        return {
          eligible: false,
          reason: `Đơn hàng chưa đạt giá trị tối thiểu ${minOrder.toFixed(0)}đ`,
        };
      }
    }

    const rule = PromotionRuleFactory.createRule(candidate.conditions);
    const ruleResult = await rule.isSatisfiedBy(context);
    if (!ruleResult.passed) {
      return {
        eligible: false,
        reason: ruleResult.reason ?? 'Không thỏa mãn điều kiện áp dụng của chương trình',
      };
    }

    const strategyType =
      candidate.conditions &&
      typeof candidate.conditions === 'object' &&
      'tiers' in candidate.conditions
        ? 'TIERED'
        : candidate.discountType;

    const strategy = DiscountStrategyFactory.getStrategy(strategyType);

    const calculationConfig: Record<string, unknown> = {
      discountValue: candidate.discountValue,
      maxDiscountAmount: candidate.maxDiscountAmount,
      ...(candidate.conditions ?? {}),
    };

    const calculation = strategy.calculate(context.subtotal, calculationConfig, context);

    return {
      eligible: true,
      evaluated: {
        promotionId: candidate.id,
        name: candidate.name,
        discountType: strategy.type,
        discountAmount: calculation.discountAmount,
        finalAmount: calculation.finalAmount,
        breakdown: calculation.breakdown,
      },
    };
  }
}
