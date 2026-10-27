import { Decimal } from 'decimal.js';

import type { PromotionContext } from '../promotion.context.js';
import type { PromotionRule, RuleEvaluationResult } from './rule.interface.js';

export enum CustomerSegment {
  ALL = 'ALL',
  NEW_CUSTOMER = 'NEW_CUSTOMER',
  VIP_CUSTOMER = 'VIP_CUSTOMER',
  LOYAL_CUSTOMER = 'LOYAL_CUSTOMER',
  TARGETED_USERS = 'TARGETED_USERS',
  REGISTERED_ONLY = 'REGISTERED_ONLY',
}

export interface CustomerSegmentConfig {
  segment: CustomerSegment | string;
  minSpent?: number | string;
  minOrders?: number;
  userIds?: string[];
}

export class CustomerSegmentRule implements PromotionRule {
  readonly type = 'CUSTOMER_SEGMENT';

  private readonly segment: CustomerSegment | string;
  private readonly minSpent?: Decimal;
  private readonly minOrders?: number;
  private readonly userIds?: Set<string>;

  constructor(config: CustomerSegmentConfig) {
    this.segment = config.segment;
    this.minSpent = config.minSpent !== undefined ? new Decimal(config.minSpent) : undefined;
    this.minOrders = config.minOrders;
    this.userIds = config.userIds ? new Set(config.userIds) : undefined;
  }

  isSatisfiedBy(context: PromotionContext): RuleEvaluationResult {
    if (this.segment === CustomerSegment.ALL) {
      return { passed: true };
    }

    if (this.segment === CustomerSegment.REGISTERED_ONLY) {
      if (!context.userId) {
        return {
          passed: false,
          reason: 'Chương trình chỉ áp dụng cho khách hàng đã đăng nhập tài khoản',
        };
      }
      return { passed: true };
    }

    if (this.segment === CustomerSegment.TARGETED_USERS) {
      if (!context.userId) {
        return {
          passed: false,
          reason: 'Chương trình chỉ áp dụng cho danh sách khách hàng được chỉ định',
        };
      }
      if (!this.userIds || !this.userIds.has(context.userId)) {
        return {
          passed: false,
          reason: 'Tài khoản của bạn không nằm trong danh sách áp dụng ưu đãi này',
        };
      }
      return { passed: true };
    }

    // Các phân khúc dựa trên lịch sử mua sắm: NEW_CUSTOMER, VIP_CUSTOMER, LOYAL_CUSTOMER
    if (!context.userId) {
      return {
        passed: false,
        reason: 'Vui lòng đăng nhập để kiểm tra điều kiện áp dụng cho hạng khách hàng',
      };
    }

    const metrics = context.customerMetrics ?? {
      orderCount: 0,
      totalSpent: new Decimal(0),
      isNewCustomer: true,
      isVipCustomer: false,
    };

    if (this.segment === CustomerSegment.NEW_CUSTOMER) {
      if (metrics.orderCount > 0) {
        return {
          passed: false,
          reason: 'Chương trình chỉ áp dụng cho đơn hàng đầu tiên của khách hàng mới',
        };
      }
      return { passed: true };
    }

    if (this.segment === CustomerSegment.VIP_CUSTOMER) {
      const requiredSpent = this.minSpent ?? new Decimal(2_000_000);
      const requiredOrders = this.minOrders ?? 3;
      const isEligible =
        metrics.totalSpent.gte(requiredSpent) || metrics.orderCount >= requiredOrders;

      if (!isEligible) {
        return {
          passed: false,
          reason: `Chương trình chỉ dành riêng cho khách hàng VIP (chi tiêu từ ${requiredSpent.toFixed(0)}đ hoặc từ ${requiredOrders} đơn hàng)`,
        };
      }
      return { passed: true };
    }

    if (this.segment === CustomerSegment.LOYAL_CUSTOMER) {
      const requiredOrders = this.minOrders ?? 2;
      if (metrics.orderCount < requiredOrders) {
        return {
          passed: false,
          reason: `Chương trình chỉ dành cho khách hàng thân thiết có từ ${requiredOrders} đơn hàng hoàn tất`,
        };
      }
      return { passed: true };
    }

    return { passed: true };
  }
}
