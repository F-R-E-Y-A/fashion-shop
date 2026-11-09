import {
  CategoryRule,
  MinItemCountRule,
  MinOrderAmountRule,
} from '../rules/cart-conditions.rule.js';
import {
  AndCompositeRule,
  NotRule,
  OrCompositeRule,
  PassAllRule,
} from '../rules/composite.rule.js';
import { CustomerSegmentRule } from '../rules/customer-segment.rule.js';
import type { PromotionRule } from '../rules/rule.interface.js';
import { TimeWindowRule } from '../rules/time-schedule.rule.js';

export class PromotionRuleFactory {
  static createRule(config?: Record<string, unknown> | null): PromotionRule {
    if (!config || typeof config !== 'object') {
      return new PassAllRule();
    }

    const type = (config.type as string | undefined)?.toUpperCase();

    switch (type) {
      case 'AND': {
        const rules = Array.isArray(config.rules)
          ? config.rules.map((r) => this.createRule(r as Record<string, unknown>))
          : [];
        return new AndCompositeRule(rules);
      }
      case 'OR': {
        const rules = Array.isArray(config.rules)
          ? config.rules.map((r) => this.createRule(r as Record<string, unknown>))
          : [];
        return new OrCompositeRule(rules);
      }
      case 'NOT': {
        const rule = config.rule
          ? this.createRule(config.rule as Record<string, unknown>)
          : new PassAllRule();
        return new NotRule(rule);
      }
      case 'CUSTOMER_SEGMENT': {
        return new CustomerSegmentRule({
          segment: (config.segment as string) ?? 'ALL',
          minSpent: config.minSpent as string | number | undefined,
          minOrders: config.minOrders as number | undefined,
          userIds: Array.isArray(config.userIds) ? (config.userIds as string[]) : undefined,
        });
      }
      case 'MIN_ORDER_AMOUNT': {
        return new MinOrderAmountRule((config.value as string | number) ?? 0);
      }
      case 'MIN_ITEM_COUNT': {
        return new MinItemCountRule((config.minItems as number) ?? 1);
      }
      case 'CATEGORY': {
        const categorySlugs = Array.isArray(config.categorySlugs)
          ? (config.categorySlugs as string[])
          : [];
        return new CategoryRule(categorySlugs);
      }
      case 'TIME_WINDOW': {
        return new TimeWindowRule({
          startHour: config.startHour as number | undefined,
          endHour: config.endHour as number | undefined,
          daysOfWeek: Array.isArray(config.daysOfWeek)
            ? (config.daysOfWeek as number[])
            : undefined,
        });
      }
      default: {
        if (Array.isArray(config.and)) {
          return new AndCompositeRule(
            config.and.map((r) => this.createRule(r as Record<string, unknown>)),
          );
        }
        if (Array.isArray(config.or)) {
          return new OrCompositeRule(
            config.or.map((r) => this.createRule(r as Record<string, unknown>)),
          );
        }
        return new PassAllRule();
      }
    }
  }
}
