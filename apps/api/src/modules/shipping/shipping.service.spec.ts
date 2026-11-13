import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import type { OrdersService } from '../orders/index.js';
import type { PaymentsService } from '../payments/index.js';
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

    it('tạo vận đơn thành công với tiền tố Sandbox GHN-SBX-... và isMock: true', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-261113ABCDEFGH',
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

      expect(res.trackingNumber).toBe('GHN-SBX-261113ABCDEFGH');
      expect(res.carrierName).toBe('GHN');
      expect(res.status).toBe('PENDING');
      expect(res.isMock).toBe(true);
    });
  });

  describe('updateShipmentStatus', () => {
    it('chặn lùi trạng thái khi vận đơn đã DELIVERED nhưng nhận sự kiện IN_TRANSIT', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'DELIVERED',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                status: 'DELIVERED',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
            shipment: {
              update: vi.fn(),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      await expect(service.updateShipmentStatus('ord-1', 'IN_TRANSIT')).rejects.toThrow(
        ConflictException,
      );
    });

    it('chặn cập nhật trạng thái vận đơn khi đơn hàng đã bị hủy (CANCELLED)', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
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
                orderCode: 'FR123',
                status: 'CANCELLED',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      await expect(service.updateShipmentStatus('ord-1', 'IN_TRANSIT')).rejects.toThrow(
        new ConflictException('Đơn hàng đã bị hủy, không thể cập nhật vận chuyển.'),
      );
    });

    it('xử lý trùng trạng thái idempotent mà không cập nhật DB hay nhảy trạng thái đơn', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'DELIVERED',
        createdAt: now,
        updatedAt: now,
      };
      const mockUpdate = vi.fn();
      const mockOrders = { transition: vi.fn() } as unknown as OrdersService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                status: 'DELIVERED',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
            shipment: {
              update: mockUpdate,
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      const res = await service.updateShipmentStatus('ord-1', 'DELIVERED');

      expect(res.status).toBe('DELIVERED');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockOrders.transition).not.toHaveBeenCalled();
    });

    it('giao thành công: chuyển đơn sang DELIVERED và chốt thu COD với receipt chuẩn COD:<orderCode>:<uuid> (tương thích Reporting #112)', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'IN_TRANSIT',
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;
      const mockPayments = {
        record: vi.fn().mockResolvedValue(true),
      } as unknown as PaymentsService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR123',
                status: 'SHIPPED',
                shipment: mockShipment,
                payments: [{ id: 'pay-1', gateway: 'COD', status: 'PENDING' }],
                items: [{ productVariantId: 'var-1', quantity: 2 }],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue({ ...mockShipment, status: 'DELIVERED' }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders, undefined, mockPayments);
      const res = await service.updateShipmentStatus(
        'ord-1',
        'DELIVERED',
        undefined,
        'Shipper đã giao thành công',
      );

      expect(res.status).toBe('DELIVERED');
      // Điểm sửa P2: Định dạng receipt COD SUCCEEDED phải có tiền tố COD:<orderCode>:<uuid>
      expect(mockPayments.record).toHaveBeenCalledWith(
        'pay-1',
        'SUCCEEDED',
        expect.stringMatching(/^COD:FR123:[0-9a-f]{8}$/),
        expect.objectContaining({ note: 'Shipper đã giao thành công' }),
        expect.anything(),
      );
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-1',
        'DELIVERED',
        expect.anything(),
        undefined,
      );
    });

    it('giao thất bại: hoàn hàng về kho và hủy đơn', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'IN_TRANSIT',
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;
      const mockInventory = {
        restock: vi.fn().mockResolvedValue(undefined),
      } as unknown as InventoryService;
      const mockPayments = {
        record: vi.fn().mockResolvedValue(true),
      } as unknown as PaymentsService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR123',
                status: 'SHIPPED',
                shipment: mockShipment,
                payments: [{ id: 'pay-1', gateway: 'COD', status: 'PENDING' }],
                items: [{ productVariantId: 'var-1', quantity: 2 }],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue({ ...mockShipment, status: 'FAILED' }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders, mockInventory, mockPayments);
      const res = await service.updateShipmentStatus(
        'ord-1',
        'FAILED',
        undefined,
        'Khách từ chối nhận',
      );

      expect(res.status).toBe('FAILED');
      expect(mockPayments.record).toHaveBeenCalledWith(
        'pay-1',
        'FAILED',
        'COD-FAILED:FR123',
        expect.objectContaining({ note: 'Khách từ chối nhận' }),
        expect.anything(),
      );
      expect(mockInventory.restock).toHaveBeenCalledWith(
        'ord-1',
        [{ variantId: 'var-1', quantity: 2 }],
        expect.anything(),
      );
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-1',
        'CANCELLED',
        expect.anything(),
        undefined,
      );
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

    it('cập nhật IN_TRANSIT và chuyển đơn sang SHIPPED với actorUserId = undefined (tách danh tính hãng khỏi UUID)', async () => {
      const now = new Date();
      const mockOrders = {
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;

      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'IN_TRANSIT',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        shipment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'ship-1',
            orderId: 'ord-1',
            trackingNumber: 'GHN-SBX-123',
          }),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                status: 'PROCESSING',
                shipment: { ...mockShipment, status: 'PENDING' },
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
        carrierName: 'GHN',
      });

      expect(res.processed).toBe(true);
      // ĐIỂM SỬA P1: Phải là undefined, không được truyền 'GHN' hay 'CARRIER_WEBHOOK' vào actorUserId
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-1',
        'SHIPPED',
        expect.anything(),
        undefined,
      );
    });

    it('bảo vệ tính toàn vẹn khi webhook gửi sự kiện đến muộn (vận đơn đã DELIVERED nhưng nhận IN_TRANSIT)', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'DELIVERED',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        shipment: {
          findUnique: vi.fn().mockResolvedValue(mockShipment),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                status: 'DELIVERED',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const res = await service.handleWebhook({
        orderId: 'ord-1',
        status: 'IN_TRANSIT',
      });

      expect(res.received).toBe(true);
      expect(res.processed).toBe(false);
      expect((res as { ignored?: boolean }).ignored).toBe(true);
      expect(res.status).toBe('DELIVERED');
    });

    it('bảo vệ tính toàn vẹn khi webhook gửi sự kiện cho đơn hàng đã bị hủy (CANCELLED)', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      const mockPrisma = {
        shipment: {
          findUnique: vi.fn().mockResolvedValue(mockShipment),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR123',
                status: 'CANCELLED',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);
      const res = await service.handleWebhook({
        orderId: 'ord-1',
        status: 'IN_TRANSIT',
      });

      expect(res.received).toBe(true);
      expect(res.processed).toBe(false);
      expect((res as { ignored?: boolean }).ignored).toBe(true);
      expect((res as { reason?: string }).reason).toBe(
        'Đơn hàng đã bị hủy, không thể cập nhật vận chuyển.',
      );
      expect(res.status).toBe('PENDING');
    });
  });
});
