import type { PromotionContext } from '../promotion.context.js';
import type { PromotionRule, RuleEvaluationResult } from './rule.interface.js';

export interface TimeWindowConfig {
  startHour?: number; // 0-23
  endHour?: number; // 0-23
  daysOfWeek?: number[]; // 0: Chu nhat, 1: Thu 2, ..., 6: Thu 7
}

export class TimeWindowRule implements PromotionRule {
  readonly type = 'TIME_WINDOW';

  constructor(private readonly config: TimeWindowConfig) {}

  isSatisfiedBy(context: PromotionContext): RuleEvaluationResult {
    const now = context.now;

    if (this.config.daysOfWeek && this.config.daysOfWeek.length > 0) {
      const day = now.getDay();
      if (!this.config.daysOfWeek.includes(day)) {
        return {
          passed: false,
          reason: 'Khuyến mãi không áp dụng vào ngày hôm nay',
        };
      }
    }

    if (this.config.startHour !== undefined && this.config.endHour !== undefined) {
      const currentHour = now.getHours();
      if (currentHour < this.config.startHour || currentHour >= this.config.endHour) {
        return {
          passed: false,
          reason: `Khuyến mãi chỉ áp dụng trong khung giờ ${this.config.startHour}:00 - ${this.config.endHour}:00`,
        };
      }
    }

    return { passed: true };
  }
}
