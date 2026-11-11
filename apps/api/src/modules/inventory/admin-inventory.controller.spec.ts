import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminInventoryController } from './admin-inventory.controller.js';
import type { AdminInventoryService } from './admin-inventory.service.js';
import { LowStockQuery } from './dto/admin-inventory.dto.js';

describe('AdminInventoryController (UC-13.1 / Issue #92)', () => {
  let controller: AdminInventoryController;
  let service: {
    list: ReturnType<typeof vi.fn>;
    lowStock: ReturnType<typeof vi.fn>;
    detail: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      list: vi.fn(),
      lowStock: vi.fn(),
      detail: vi.fn(),
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
});
