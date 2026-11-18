import { describe, expect, it } from 'vitest';

import { ReturnReason, ReturnStatus } from '../../generated/prisma/enums.js';
import { RETURN_STATUSES } from './dto/return-input.dto.js';
import {
  photoRequired,
  refundBreakdown,
  RETURN_REASONS,
  returnDeadline,
  withinReturnWindow,
} from './return-policy.js';

const DAY = 86_400_000;
const order = {
  subtotalAmount: '500000.00',
  discountAmount: '0.00',
  shippingFeeAmount: '30000.00',
  items: [
    { id: 'a', quantity: 2, unitPrice: '200000.00' },
    { id: 'b', quantity: 1, unitPrice: '100000.00' },
  ],
};

describe('return-policy (ADR-067)', () => {
  it('enum trong DTO khop Prisma: them gia tri o mot noi thi bai nay do', () => {
    expect([...RETURN_REASONS].sort()).toEqual(Object.values(ReturnReason).sort());
    expect([...RETURN_STATUSES].sort()).toEqual(Object.values(ReturnStatus).sort());
  });

  it('UC-14.1/AC2 dung moc 15 ngay van tra duoc, qua 1 ms thi khong', () => {
    const delivered = new Date('2026-11-01T03:00:00Z');
    expect(returnDeadline(delivered).getTime() - delivered.getTime()).toBe(15 * DAY);
    expect(withinReturnWindow(delivered, new Date(delivered.getTime() + 15 * DAY))).toBe(true);
    expect(withinReturnWindow(delivered, new Date(delivered.getTime() + 15 * DAY + 1))).toBe(false);
  });

  it('UC-14.1/AC6 anh bat buoc khi loi/sai hang; kho anh tat thi khong bat', () => {
    expect(photoRequired('DEFECTIVE', true)).toBe(true);
    expect(photoRequired('WRONG_ITEM', true)).toBe(true);
    expect(photoRequired('SIZE_MISMATCH', true)).toBe(false);
    expect(photoRequired('DEFECTIVE', false)).toBe(false);
  });

  it('UC-14.2/BR1 tien hoan = don gia x so luong tra; tra mot phan khong hoan phi giao', () => {
    const result = refundBreakdown(order, [{ orderItemId: 'a', quantity: 1 }], 'DEFECTIVE');
    expect(result.items[0]!.amount.toFixed(2)).toBe('200000.00');
    expect(result.shipping.toFixed(2)).toBe('0.00');
    expect(result.total.toFixed(2)).toBe('200000.00');
  });

  it('UC-14.2/BR1 tra ca don vi loi shop thi hoan ca phi giao; vi ly do khac thi khong', () => {
    const all = [
      { orderItemId: 'a', quantity: 2 },
      { orderItemId: 'b', quantity: 1 },
    ];
    expect(refundBreakdown(order, all, 'WRONG_ITEM').total.toFixed(2)).toBe('530000.00');
    expect(refundBreakdown(order, all, 'CHANGED_MIND').total.toFixed(2)).toBe('500000.00');
  });

  it('giam gia chia theo ti le tien hang, lam tron 2 so le', () => {
    const discounted = { ...order, discountAmount: '50000.00' };
    const result = refundBreakdown(
      discounted,
      [{ orderItemId: 'b', quantity: 1 }],
      'SIZE_MISMATCH',
    );
    // 100000 - 50000 * 100000 / 500000 = 90000
    expect(result.total.toFixed(2)).toBe('90000.00');
  });
});
