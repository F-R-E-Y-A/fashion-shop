import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiscountType, PromotionStatus } from '../../generated/prisma/enums.js';
import { AdminPromotionsController } from './admin-promotions.controller.js';
import type { PromotionsService } from './promotions.service.js';

describe('AdminPromotionsController (UC-10.1)', () => {
  let controller: AdminPromotionsController;
  let service: {
    listPromotions: ReturnType<typeof vi.fn>;
    createPromotion: ReturnType<typeof vi.fn>;
    getPromotionById: ReturnType<typeof vi.fn>;
    updatePromotion: ReturnType<typeof vi.fn>;
    deletePromotion: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      listPromotions: vi.fn(),
      createPromotion: vi.fn(),
      getPromotionById: vi.fn(),
      updatePromotion: vi.fn(),
      deletePromotion: vi.fn(),
    };
    controller = new AdminPromotionsController(service as unknown as PromotionsService);
  });

  it('ủy quyền listPromotions với query tham số phân trang', async () => {
    service.listPromotions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 12,
      totalPages: 0,
    });

    const res = await controller.list({ page: 2, pageSize: 24 });
    expect(service.listPromotions).toHaveBeenCalledWith({ page: 2, pageSize: 24 });
    expect(res.page).toBe(1);
  });

  it('ủy quyền createPromotion với dto tạo mới', async () => {
    const dto = {
      name: 'KM Mua Sam',
      discountType: DiscountType.PERCENTAGE,
      discountValue: '15',
    };
    service.createPromotion.mockResolvedValue({
      id: 'p-1',
      ...dto,
      maxDiscountAmount: null,
      minOrderAmount: null,
      conditions: null,
      status: PromotionStatus.ACTIVE,
      startsAt: null,
      endsAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const res = await controller.create(dto);
    expect(service.createPromotion).toHaveBeenCalledWith(dto);
    expect(res.id).toBe('p-1');
  });

  it('ủy quyền getPromotionById với UUID', async () => {
    service.getPromotionById.mockResolvedValue({ id: 'p-1', name: 'KM' });
    const res = await controller.getById('p-1');
    expect(service.getPromotionById).toHaveBeenCalledWith('p-1');
    expect(res.id).toBe('p-1');
  });

  it('ủy quyền updatePromotion với id và dto', async () => {
    const dto = { name: 'KM Doi Ten', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' };
    service.updatePromotion.mockResolvedValue({ id: 'p-1', ...dto });
    const res = await controller.update('p-1', dto);
    expect(service.updatePromotion).toHaveBeenCalledWith('p-1', dto);
    expect(res.name).toBe('KM Doi Ten');
  });

  it('ủy quyền deletePromotion để đổi trạng thái INACTIVE', async () => {
    service.deletePromotion.mockResolvedValue({ ok: true, message: 'Đã chuyển trạng thái' });
    const res = await controller.delete('p-1');
    expect(service.deletePromotion).toHaveBeenCalledWith('p-1');
    expect(res.ok).toBe(true);
  });
});
