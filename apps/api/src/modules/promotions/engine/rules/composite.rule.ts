import type { PromotionContext } from '../promotion.context.js';
import type { PromotionRule, RuleEvaluationResult } from './rule.interface.js';

export class AndCompositeRule implements PromotionRule {
  readonly type = 'AND';

  constructor(private readonly rules: PromotionRule[]) {}

  async isSatisfiedBy(context: PromotionContext): Promise<RuleEvaluationResult> {
    for (const rule of this.rules) {
      const result = await rule.isSatisfiedBy(context);
      if (!result.passed) {
        return result;
      }
    }
    return { passed: true };
  }
}

export class OrCompositeRule implements PromotionRule {
  readonly type = 'OR';

  constructor(private readonly rules: PromotionRule[]) {}

  async isSatisfiedBy(context: PromotionContext): Promise<RuleEvaluationResult> {
    if (this.rules.length === 0) {
      return { passed: true };
    }

    const reasons: string[] = [];
    for (const rule of this.rules) {
      const result = await rule.isSatisfiedBy(context);
      if (result.passed) {
        return { passed: true };
      }
      if (result.reason) {
        reasons.push(result.reason);
      }
    }

    return {
      passed: false,
      reason: reasons.length > 0 ? reasons.join(' hoặc ') : 'Không thỏa mãn điều kiện áp dụng',
    };
  }
}

export class NotRule implements PromotionRule {
  readonly type = 'NOT';

  constructor(private readonly rule: PromotionRule) {}

  async isSatisfiedBy(context: PromotionContext): Promise<RuleEvaluationResult> {
    const result = await this.rule.isSatisfiedBy(context);
    if (result.passed) {
      return {
        passed: false,
        reason: 'Không thỏa mãn điều kiện loại trừ của chương trình',
      };
    }
    return { passed: true };
  }
}

export class PassAllRule implements PromotionRule {
  readonly type = 'PASS_ALL';

  isSatisfiedBy(): RuleEvaluationResult {
    return { passed: true };
  }
}
