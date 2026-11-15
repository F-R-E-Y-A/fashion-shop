import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminInventoryController } from './admin-inventory.controller.js';
import type { AdminInventoryService } from './admin-inventory.service.js';
import { AdminAdjustStockDto, LowStockQuery } from './dto/admin-inventory.dto.js';

describe('AdminInventoryController (UC-13.1 / Issue #92 / PH-13)', () => {
  let controller: AdminInventoryController;
  let service: {
    list: ReturnType<typeof vi.fn>;
    lowStock: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
    adjust: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      list: vi.fn(),
      lowStock: vi.fn(),
      detail: vi.fn(),
      adjust: vi.fn(),
    };
    controller = new AdminInventoryController(service as unknown as AdminInventoryService);
  });

  it('gọi service.lowStock với query tương ứng', async () => {
    const mockResponse = {
      items: [],
      total: 0,
      threshold: 5,
      asOf: new Date().toISOString(),
    };
    service.lowStock.mockResolvedValue(mockResponse);

    const query = new LowStockQuery();
    const result = await controller.lowStock(query);

    expect(service.lowStock).toHaveBeenCalledWith(query);
    expect(result).toBe(mockResponse);
  });

  it('gọi service.list với query phân trang', async () => {
    const mockList = { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0, asOf: '' };
    service.list.mockResolvedValue(mockList);

    const result = await controller.list({ page: 1, pageSize: 12 });
    expect(service.list).toHaveBeenCalledWith({ page: 1, pageSize: 12 });
    expect(result).toBe(mockList);
  });

  it('gọi service.detail với id và query', async () => {
    const mockDetail = {
      id: 'v-1',
      movements: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    service.detail.mockResolvedValue(mockDetail);

    const result = await controller.detail({ id: 'v-1' }, { page: 1, pageSize: 12 });
    expect(service.detail).toHaveBeenCalledWith('v-1', { page: 1, pageSize: 12 });
    expect(result).toBe(mockDetail);
  });

  it('gọi service.adjust với id và dto', async () => {
    const mockDetail = {
      id: 'v-1',
      quantityOnHand: 30,
      reservedQuantity: 5,
      availableQuantity: 25,
      movements: { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 },
    };
    service.adjust.mockResolvedValue(mockDetail);

    const dto = plainToInstance(AdminAdjustStockDto, {
      type: 'RECEIPT',
      quantity: 20,
      reason: 'Nhập lô hàng Yody',
    });
    const result = await controller.adjust({ id: 'v-1' }, dto, {
      id: 'admin-1',
      email: 'admin@example.test',
      roles: ['ADMIN'],
    });

    expect(service.adjust).toHaveBeenCalledWith('v-1', dto, 'admin-1');
    expect(result).toBe(mockDetail);
  });

  describe('LowStockQuery validation', () => {
    it('nhận giá trị mặc định khi query rỗng', async () => {
      const dto = plainToInstance(LowStockQuery, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.threshold).toBe(5);
      expect(dto.limit).toBe(5);
    });

    it('chấp nhận threshold và limit hợp lệ trong biên', async () => {
      const dto = plainToInstance(LowStockQuery, { threshold: '10', limit: '8' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.threshold).toBe(10);
      expect(dto.limit).toBe(8);
    });

    it.each([
      [{ threshold: '0' }, 'threshold nho nhat la 1'],
      [{ threshold: '101' }, 'threshold lon nhat la 100'],
      [{ threshold: '1e2' }, 'threshold phai la so nguyen'],
      [{ threshold: '2.5' }, 'threshold phai la so nguyen'],
      [{ limit: '0' }, 'limit nho nhat la 1'],
      [{ limit: '11' }, 'limit lon nhat la 10'],
      [{ limit: '2.5' }, 'limit phai la so nguyen'],
      [{ limit: '1e1' }, 'limit phai la so nguyen'],
    ])('từ chối query ngoài biên hoặc sai định dạng: %o', async (input, expectedMsg) => {
      const dto = plainToInstance(LowStockQuery, input);
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      expect(messages.some((m) => m.includes(expectedMsg))).toBe(true);
    });
  });

  describe('AdminAdjustStockDto validation', () => {
    it('chấp nhận RECEIPT hợp lệ với số lượng và lý do đầy đủ', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'RECEIPT',
        quantity: 50,
        reason: 'Nhập lô hàng mùa đông',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBe('RECEIPT');
      expect(dto.quantity).toBe(50);
      expect(dto.reason).toBe('Nhập lô hàng mùa đông');
    });

    it('chấp nhận ADJUSTMENT hợp lệ với số lượng 0 (hết hàng sau kiểm kê)', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'ADJUSTMENT',
        quantity: 0,
        reason: 'Kiểm kê thực tế hết sạch hàng',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.quantity).toBe(0);
    });

    it('tự động chuyển đổi chuỗi số thành number và trim reason', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'RECEIPT',
        quantity: '  100  ',
        reason: '   Lý do có khoảng trắng hai đầu   ',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.quantity).toBe(100);
      expect(dto.reason).toBe('Lý do có khoảng trắng hai đầu');
    });

    it('từ chối type không phải RECEIPT hoặc ADJUSTMENT', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'SALE',
        quantity: 10,
        reason: 'Thử sai type',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      expect(messages.some((m) => m.includes('type phai la RECEIPT hoac ADJUSTMENT'))).toBe(true);
    });

    it('từ chối lý do rỗng hoặc chỉ có khoảng trắng', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'RECEIPT',
        quantity: 10,
        reason: '   ',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      expect(messages.some((m) => m.includes('Ly do khong duoc de trong'))).toBe(true);
    });

    it('từ chối lý do vượt quá 255 ký tự', async () => {
      const dto = plainToInstance(AdminAdjustStockDto, {
        type: 'RECEIPT',
        quantity: 10,
        reason: 'a'.repeat(256),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
      expect(messages.some((m) => m.includes('Ly do khong duoc vuot qua 255 ky tu'))).toBe(true);
    });

    it('từ chối số lượng âm hoặc vượt quá 1.000.000', async () => {
      const dtoNegative = plainToInstance(AdminAdjustStockDto, {
        type: 'ADJUSTMENT',
        quantity: -5,
        reason: 'Sai số lượng âm',
      });
      const errorsNegative = await validate(dtoNegative);
      expect(errorsNegative.length).toBeGreaterThan(0);

      const dtoOver = plainToInstance(AdminAdjustStockDto, {
        type: 'RECEIPT',
        quantity: 1000001,
        reason: 'Quá giới hạn kho',
      });
      const errorsOver = await validate(dtoOver);
      expect(errorsOver.length).toBeGreaterThan(0);
    });
  });
});
