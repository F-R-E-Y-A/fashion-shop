import { Decimal } from 'decimal.js';

import type { PromotionContext } from '../promotion.context.js';
import type { PromotionRule, RuleEvaluationResult } from './rule.interface.js';

export class MinOrderAmountRule implements PromotionRule {
  readonly type = 'MIN_ORDER_AMOUNT';
  private readonly minAmount: Decimal;

  constructor(minAmount: Decimal | string | number) {
    this.minAmount = new Decimal(minAmount);
  }

  isSatisfiedBy(context: PromotionContext): RuleEvaluationResult {
    if (context.subtotal.lt(this.minAmount)) {
      return {
        passed: false,
        reason: `Đơn hàng chưa đạt giá trị tối thiểu ${this.minAmount.toFixed(0)}đ để áp dụng khuyến mãi`,
      };
    }
    return { passed: true };
  }
}

export class MinItemCountRule implements PromotionRule {
  readonly type = 'MIN_ITEM_COUNT';
  private readonly minItems: number;

  constructor(minItems: number) {
    this.minItems = minItems;
  }

  isSatisfiedBy(context: PromotionContext): RuleEvaluationResult {
    const totalItems = context.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    if (totalItems < this.minItems) {
      return {
        passed: false,
        reason: `Giỏ hàng cần tối thiểu ${this.minItems} sản phẩm để nhận ưu đãi`,
      };
    }
    return { passed: true };
  }
}

export class CategoryRule implements PromotionRule {
  readonly type = 'CATEGORY';
  private readonly allowedCategorySlugs: Set<string>;

  constructor(categorySlugs: string[]) {
    this.allowedCategorySlugs = new Set(categorySlugs.map((s) => s.toLowerCase()));
  }

  isSatisfiedBy(context: PromotionContext): RuleEvaluationResult {
    if (!context.items || context.items.length === 0) {
      return { passed: true };
    }

    const hasMatchingCategory = context.items.some(
      (item) => item.categorySlug && this.allowedCategorySlugs.has(item.categorySlug.toLowerCase()),
    );

    if (!hasMatchingCategory) {
      return {
        passed: false,
        reason: 'Khuyến mãi chỉ áp dụng cho sản phẩm thuộc danh mục quy định',
      };
    }

    return { passed: true };
  }
}
