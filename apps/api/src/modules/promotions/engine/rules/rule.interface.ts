import type { PromotionContext } from '../promotion.context.js';

export interface RuleEvaluationResult {
  passed: boolean;
  reason?: string;
}

export interface PromotionRule {
  readonly type: string;
  isSatisfiedBy(context: PromotionContext): Promise<RuleEvaluationResult> | RuleEvaluationResult;
}
