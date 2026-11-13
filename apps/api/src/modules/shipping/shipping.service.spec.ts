import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { OrdersService } from '../orders/index.js';
import { ShippingService } from './shipping.service.js';

describe('ShippingService', () => {
  describe('quote', () => {
    it('miễn phí vận chuyển khi đơn từ 500.000đ trở lên (ADR-027)', async () => {
      const mockPrisma = {
        shippingRate: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'rate-1', fee: { toFixed: () => '30000.00' } }),
        },
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const result = await service.quote('area-1', '500000.00');

      expect(result).toEqual({ rateId: 'rate-1', fee: '0.00' });
    });

    it('tính phí chuẩn khi đơn dưới 500.000đ', async () => {
      const mockPrisma = {
        shippingRate: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'rate-1', fee: { toFixed: () => '30000.00' } }),
        },
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const result = await service.quote('area-1', '250000.00');

      expect(result).toEqual({ rateId: 'rate-1', fee: '30000.00' });
    });

    it('báo lỗi 422 khi không có biểu phí cho khu vực', async () => {
      const mockPrisma = {
        shippingRate: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      await expect(service.quote('area-unknown', '100000.00')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('createShipment', () => {
    it('từ chối tạo vận đơn cho đơn chưa sẵn sàng (PENDING_PAYMENT)', async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({ id: 'ord-1', status: 'PENDING_PAYMENT' }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      await expect(service.createShipment('ord-1', { carrierName: 'GHN' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('từ chối nếu không tìm thấy đơn hàng', async () => {
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue(null),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      await expect(service.createShipment('ord-none', { carrierName: 'GHN' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('tạo vận đơn thành công cho đơn PROCESSING', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN261113ABCDEFGH',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR261113ABCDEFGH',
                status: 'PROCESSING',
              }),
            },
            shipment: {
              upsert: vi.fn().mockResolvedValue(mockShipment),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const res = await service.createShipment('ord-1', { carrierName: 'GHN' });

      expect(res.trackingNumber).toBe('GHN261113ABCDEFGH');
      expect(res.carrierName).toBe('GHN');
      expect(res.status).toBe('PENDING');
    });
  });

  describe('handleWebhook', () => {
    it('bỏ qua nếu không tìm thấy vận đơn', async () => {
      const mockPrisma = {
        shipment: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const res = await service.handleWebhook({
        orderId: '00000000-0000-0000-0000-000000000001',
        status: 'IN_TRANSIT',
      });

      expect(res.received).toBe(true);
      expect(res.processed).toBe(false);
    });

    it('cập nhật IN_TRANSIT và chuyển đơn sang SHIPPED', async () => {
      const now = new Date();
      const mockOrders = {
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;

      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN123',
        status: 'IN_TRANSIT',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        shipment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'ship-1',
            orderId: 'ord-1',
            trackingNumber: 'GHN123',
          }),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                status: 'PROCESSING',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue(mockShipment),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      const res = await service.handleWebhook({
        orderId: 'ord-1',
        status: 'IN_TRANSIT',
      });

      expect(res.processed).toBe(true);
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-1',
        'SHIPPED',
        expect.anything(),
        'CARRIER_WEBHOOK',
      );
    });
  });
});
