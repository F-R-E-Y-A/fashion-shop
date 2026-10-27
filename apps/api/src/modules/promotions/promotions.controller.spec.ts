import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscountType } from '../../generated/prisma/enums.js';
import { PromotionsController } from './promotions.controller.js';
import type { PromotionsService } from './promotions.service.js';

describe('PromotionsController (Storefront - UC-07.2)', () => {
  let controller: PromotionsController;
  let service: {
    validateVoucher: ReturnType<typeof vi.fn>;
    getAvailableVouchers: ReturnType<typeof vi.fn>;
    getActivePromotions: ReturnType<typeof vi.fn>;
    evaluateCart: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      validateVoucher: vi.fn(),
      getAvailableVouchers: vi.fn(),
      getActivePromotions: vi.fn(),
      evaluateCart: vi.fn(),
    };
    controller = new PromotionsController(service as unknown as PromotionsService);
  });

  it('gọi service.validateVoucher với đúng tham số khi áp dụng mã', async () => {
    service.validateVoucher.mockResolvedValue({
      valid: true,
      voucherId: 'v-1',
      code: 'TEST10',
      discountType: DiscountType.PERCENTAGE,
      discountValue: '10',
      discountAmount: '50000',
      finalAmount: '450000',
    });

    const res = await controller.applyVoucher(
      { code: 'TEST10', subtotal: '500000' },
      { id: 'user-1', email: 'test@example.com', roles: ['CUSTOMER'] },
    );

    expect(service.validateVoucher).toHaveBeenCalledWith('TEST10', '500000', 'user-1');
    expect(res.discountAmount).toBe('50000');
  });

  it('gọi service.getAvailableVouchers khi lấy danh sách mã cho khách', async () => {
    service.getAvailableVouchers.mockResolvedValue([]);
    await controller.getAvailableVouchers();
    expect(service.getAvailableVouchers).toHaveBeenCalled();
  });

  it('gọi service.getActivePromotions khi lấy banner khuyến mãi', async () => {
    service.getActivePromotions.mockResolvedValue([]);
    await controller.getActivePromotions();
    expect(service.getActivePromotions).toHaveBeenCalled();
  });

  it('gọi service.evaluateCart khi đánh giá khuyến mãi giỏ hàng', async () => {
    service.evaluateCart.mockResolvedValue({
      subtotal: '500000',
      applicablePromotions: [],
      bestPromotion: null,
    });
    const res = await controller.evaluate(
      { subtotal: '500000' },
      { id: 'user-1', email: 'test@example.com', roles: ['CUSTOMER'] },
    );
    expect(service.evaluateCart).toHaveBeenCalledWith({ subtotal: '500000' }, 'user-1');
    expect(res.subtotal).toBe('500000');
  });
});
