import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import type { NotificationsService } from '../notifications/index.js';
import { type OrdersService, registerPostCommitHook } from '../orders/index.js';
import type { PaymentsService } from '../payments/index.js';
import { GhnApiRejectedError, type GhnCarrierGateway } from './ghn.carrier.js';
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

    it('khoá đơn trước khi tạo vận đơn và chặn ghi đè khi vận đơn đã rời kho (khác PENDING)', async () => {
      const callOrder: string[] = [];
      const mockOrders = {
        lock: vi.fn().mockImplementation(async () => {
          callOrder.push('orders.lock');
        }),
        transition: vi.fn(),
      } as unknown as OrdersService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockImplementation(async () => {
                callOrder.push('order.findUnique');
                return {
                  id: 'ord-1',
                  orderCode: 'FR261113ABCDEFGH',
                  status: 'SHIPPED',
                  shipment: { id: 'ship-1', status: 'IN_TRANSIT' },
                };
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      await expect(service.createShipment('ord-1', { carrierName: 'GHN' })).rejects.toThrow(
        ConflictException,
      );
      expect(callOrder).toEqual(['orders.lock', 'order.findUnique']);
    });

    it('chạy post-commit hook sau khi transaction createShipment hoàn tất', async () => {
      const now = new Date();
      const events: string[] = [];
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi
          .fn()
          .mockImplementation(
            async (_id: string, _status: string, tx: Prisma.TransactionClient) => {
              events.push('inside-tx');
              registerPostCommitHook(tx, async () => {
                events.push('post-commit');
              });
            },
          ),
      } as unknown as OrdersService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const res = await fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR261113ABCDEFGH',
                status: 'CONFIRMED',
              }),
            },
            shipment: {
              upsert: vi.fn().mockResolvedValue({
                id: 'ship-1',
                orderId: 'ord-1',
                carrierName: 'GHN',
                trackingNumber: 'GHN-SBX-261113ABCDEFGH',
                status: 'PENDING',
                createdAt: now,
                updatedAt: now,
              }),
            },
          });
          events.push('tx-committed');
          return res;
        }),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      await service.createShipment('ord-1', { carrierName: 'GHN' }, 'admin-1');

      expect(events).toEqual(['inside-tx', 'tx-committed', 'post-commit']);
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
      const mockOrders = { lock: vi.fn(), transition: vi.fn() } as unknown as OrdersService;

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
        lock: vi.fn().mockResolvedValue(undefined),
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
        expect.objectContaining({ note: 'Shipper đã giao thành công' }),
      );
    });

    /** Dựng service với vận đơn/đơn cho các ca FAILED, RETURNED. */
    function setupReturnFlow(opts: {
      orderStatus: string;
      shipmentStatus: string;
      payments: { id: string; gateway: string; status: string }[];
    }) {
      const now = new Date();
      const shipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: opts.shipmentStatus,
        createdAt: now,
        updatedAt: now,
      };
      const calls: string[] = [];
      const orders = {
        lock: vi.fn().mockImplementation(async () => void calls.push('lock')),
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;
      const inventory = {
        restock: vi.fn().mockResolvedValue(true),
      } as unknown as InventoryService;
      const payments = {
        record: vi.fn().mockResolvedValue(true),
      } as unknown as PaymentsService;
      const update = vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => ({
        ...shipment,
        status: data.status,
      }));
      const findUnique = vi.fn().mockImplementation(async () => {
        calls.push('findUnique');
        return {
          id: 'ord-1',
          orderCode: 'FR123',
          status: opts.orderStatus,
          shipment,
          payments: opts.payments,
          items: [{ productVariantId: 'var-1', quantity: 2 }],
        };
      });
      const prisma = {
        $transaction: vi
          .fn()
          .mockImplementation((fn: (tx: unknown) => unknown) =>
            fn({ order: { findUnique }, shipment: { update } }),
          ),
      } as unknown as PrismaService;
      return {
        calls,
        orders,
        inventory,
        payments,
        update,
        service: new ShippingService(prisma, orders, inventory, payments),
      };
    }
    const cod = [{ id: 'pay-1', gateway: 'COD', status: 'PENDING' }];

    it('khoá đơn trước khi đọc trạng thái (cùng khoá với thao tác admin)', async () => {
      const t = setupReturnFlow({
        orderStatus: 'SHIPPED',
        shipmentStatus: 'PENDING',
        payments: [],
      });

      await t.service.updateShipmentStatus('ord-1', 'IN_TRANSIT');

      expect(t.calls.slice(0, 2)).toEqual(['lock', 'findUnique']);
      expect(t.orders.lock).toHaveBeenCalledWith('ord-1', expect.anything());
    });

    it('FAILED chỉ ghi nhận vận đơn: chưa trả kho, chưa ghi thanh toán, chưa hủy đơn (hàng còn trên xe)', async () => {
      const t = setupReturnFlow({
        orderStatus: 'SHIPPED',
        shipmentStatus: 'IN_TRANSIT',
        payments: cod,
      });

      const res = await t.service.updateShipmentStatus(
        'ord-1',
        'FAILED',
        undefined,
        'Khách từ chối',
      );

      expect(res.status).toBe('FAILED');
      expect(t.update).toHaveBeenCalledWith({
        where: { orderId: 'ord-1' },
        data: { status: 'FAILED', statusNote: 'Khách từ chối' },
      });
      expect(t.inventory.restock).not.toHaveBeenCalled();
      expect(t.payments.record).not.toHaveBeenCalled();
      expect(t.orders.transition).not.toHaveBeenCalled();
    });

    it('FAILED -> RETURNED với đơn COD: hàng về kho thì trả kho một lần, ghi COD-FAILED và hủy đơn', async () => {
      const t = setupReturnFlow({
        orderStatus: 'SHIPPED',
        shipmentStatus: 'FAILED',
        payments: cod,
      });

      const res = await t.service.updateShipmentStatus(
        'ord-1',
        'RETURNED',
        undefined,
        'Hàng đã về kho',
      );

      expect(res.status).toBe('RETURNED');
      expect(t.payments.record).toHaveBeenCalledWith(
        'pay-1',
        'FAILED',
        'COD-FAILED:FR123',
        expect.objectContaining({ note: 'Hàng đã về kho' }),
        expect.anything(),
      );
      expect(t.inventory.restock).toHaveBeenCalledTimes(1);
      expect(t.inventory.restock).toHaveBeenCalledWith(
        'ord-1',
        [{ variantId: 'var-1', quantity: 2 }],
        expect.anything(),
      );
      expect(t.orders.transition).toHaveBeenCalledWith(
        'ord-1',
        'CANCELLED',
        expect.anything(),
        undefined,
        expect.objectContaining({ cancelSource: 'DELIVERY_FAILED', reason: 'Hàng đã về kho' }),
      );
    });

    it('RETURNED với đơn trả trước (đã có payment SUCCEEDED): không tự hủy, không trả kho, để admin hoàn tiền', async () => {
      const t = setupReturnFlow({
        orderStatus: 'SHIPPED',
        shipmentStatus: 'FAILED',
        payments: [{ id: 'pay-2', gateway: 'VNPAY', status: 'SUCCEEDED' }],
      });

      const res = await t.service.updateShipmentStatus('ord-1', 'RETURNED');

      expect(res.status).toBe('RETURNED');
      expect(t.payments.record).not.toHaveBeenCalled();
      expect(t.inventory.restock).not.toHaveBeenCalled();
      expect(t.orders.transition).not.toHaveBeenCalled();
    });

    it('đơn đã hủy (shop bấm Giao thất bại trước): vẫn xác nhận RETURNED nhưng không hoàn kho hay ghi thanh toán lần nữa', async () => {
      const t = setupReturnFlow({
        orderStatus: 'CANCELLED',
        shipmentStatus: 'FAILED',
        payments: cod,
      });

      const res = await t.service.updateShipmentStatus('ord-1', 'RETURNED');

      expect(res.status).toBe('RETURNED');
      expect(t.update).toHaveBeenCalledTimes(1);
      expect(t.inventory.restock).not.toHaveBeenCalled();
      expect(t.payments.record).not.toHaveBeenCalled();
      expect(t.orders.transition).not.toHaveBeenCalled();
    });

    it.each(['IN_TRANSIT', 'DELIVERED'] as const)(
      'đơn đã hủy vẫn bị chặn chuyển sang %s',
      async (status) => {
        const t = setupReturnFlow({
          orderStatus: 'CANCELLED',
          shipmentStatus: 'PENDING',
          payments: cod,
        });

        await expect(t.service.updateShipmentStatus('ord-1', status)).rejects.toThrow(
          new ConflictException('Đơn hàng đã bị hủy, không thể cập nhật vận chuyển.'),
        );
        expect(t.update).not.toHaveBeenCalled();
      },
    );

    it('chạy post-commit hook thông báo sau khi updateShipmentStatus commit', async () => {
      const now = new Date();
      const events: string[] = [];
      const mockShipment = {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-123',
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi
          .fn()
          .mockImplementation(
            async (_id: string, _status: string, tx: Prisma.TransactionClient) => {
              events.push('inside-tx');
              registerPostCommitHook(tx, async () => {
                events.push('post-commit-notified');
              });
            },
          ),
      } as unknown as OrdersService;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const res = await fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR123',
                status: 'PROCESSING',
                shipment: mockShipment,
                payments: [],
                items: [],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue({ ...mockShipment, status: 'IN_TRANSIT' }),
            },
          });
          events.push('tx-committed');
          return res;
        }),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      await service.updateShipmentStatus('ord-1', 'IN_TRANSIT');

      expect(events).toEqual(['inside-tx', 'tx-committed', 'post-commit-notified']);
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
        lock: vi.fn().mockResolvedValue(undefined),
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
        expect.objectContaining({ fromCarrierWebhook: true }),
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

  describe('GHN Sandbox & Dự phòng mô phỏng', () => {
    function sampleOrderSnapshot() {
      return {
        id: 'ord-ghn-1',
        orderCode: 'FR2611160001',
        userId: 'user-1',
        customerEmail: 'khach@freya.test',
        status: 'PROCESSING',
        shipment: null,
        subtotalAmount: { toString: () => '350000' },
        totalAmount: { toString: () => '380000' },
        shippingAddressSnapshot: {
          recipientName: 'Nguyễn Văn A',
          phone: '0909123456',
          detailAddress: '12 Nguyễn Huệ',
          commune: 'Phường Bến Nghé',
          province: 'Thành phố Hồ Chí Minh',
        },
        items: [
          {
            productVariantId: 'var-1',
            quantity: 1,
            unitPrice: { toString: () => '350000' },
            productSnapshot: { name: 'Áo sơ mi', variantLabel: 'Trắng / M' },
          },
        ],
        payments: [{ gateway: 'COD', status: 'PENDING' }],
      };
    }

    it('tạo vận đơn GHN Sandbox thành công (isMock=false), chốt intent dưới khóa trước khi gọi GHN ngoài $transaction và gửi notifyShipmentCreated', async () => {
      const now = new Date();
      const events: string[] = [];
      const orderRow = sampleOrderSnapshot();
      const savedShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã tạo vận đơn thành công trên GHN Sandbox, chờ lấy hàng.',
        expectedDeliveryAt: new Date('2026-11-18T10:00:00.000Z'),
        createdAt: now,
        updatedAt: now,
      };
      let txCount = 0;

      const mockPrisma = {
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
          txCount += 1;
          const phase = txCount;
          events.push(`tx${phase}Start`);
          const res = await fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: { upsert: vi.fn().mockResolvedValue(savedShipment) },
          });
          events.push(`tx${phase}End`);
          return res;
        }),
      } as unknown as PrismaService;

      const mockOrders = { lock: vi.fn().mockResolvedValue(undefined) } as unknown as OrdersService;
      const mockNotifications = {
        notifyShipmentCreated: vi.fn().mockImplementation(async () => void events.push('notify')),
      } as unknown as NotificationsService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockImplementation(async () => {
          events.push('ghnCreate');
          return {
            carrierName: 'GHN',
            trackingNumber: 'L4ABCDEF',
            isMock: false,
            carrierStatus: 'ready_to_pick',
            statusNote: 'Đã tạo vận đơn thành công trên GHN Sandbox, chờ lấy hàng.',
            expectedDeliveryAt: '2026-11-18T10:00:00.000Z',
          };
        }),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        mockOrders,
        undefined,
        undefined,
        mockNotifications,
        mockGhn,
      );

      const res = await service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(res.trackingNumber).toBe('L4ABCDEF');
      expect(res.isMock).toBe(false);
      expect(res.carrierStatus).toBe('ready_to_pick');
      expect(res.fallbackUsed).toBeUndefined();
      // Pha 1 khóa đơn + ghi intent trước, gọi GHN ngoài lock, rồi Pha 2 mới commit mã thật + gửi thông báo
      expect(events).toEqual(['tx1Start', 'tx1End', 'ghnCreate', 'tx2Start', 'tx2End', 'notify']);
      expect(mockOrders.lock).toHaveBeenCalledTimes(2);
      expect(mockNotifications.notifyShipmentCreated).toHaveBeenCalledTimes(1);
    });

    it('mode AUTO tự động dự phòng sang mô phỏng (isMock=true, fallbackUsed=true) khi GHN Sandbox lỗi', async () => {
      const now = new Date();
      const orderRow = sampleOrderSnapshot();
      const mockPrisma = {
        order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: {
              upsert: vi.fn().mockResolvedValue({
                id: 'ship-mock-1',
                orderId: 'ord-ghn-1',
                carrierName: 'GHN',
                trackingNumber: 'GHN-SBX-2611160001',
                status: 'PENDING',
                isMock: true,
                carrierStatus: 'mock_ready_to_pick',
                statusNote: 'Vận đơn mô phỏng Sandbox nội bộ.',
                expectedDeliveryAt: null,
                createdAt: now,
                updatedAt: now,
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('GHN timeout simulation')),
        queryOrderByClientCode: vi.fn().mockResolvedValue(null),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );

      const res = await service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(mockGhn.queryOrderByClientCode).toHaveBeenCalledWith('FR2611160001');
      expect(res.isMock).toBe(true);
      expect(res.fallbackUsed).toBe(true);
      expect(res.fallbackReason).toContain('GHN timeout');
      expect(res.trackingNumber).toBe('GHN-SBX-2611160001');
    });

    it('mode AUTO khi GHN timeout nhưng tra client_order_code thấy vận đơn thật thì khôi phục vận đơn thật (không tạo mock)', async () => {
      const now = new Date();
      const orderRow = sampleOrderSnapshot();
      const upsert = vi.fn().mockResolvedValue({
        id: 'ship-ghn-recovered',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4RECOVERED',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã khôi phục vận đơn thật từ GHN Sandbox theo mã đơn hàng.',
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const mockPrisma = {
        order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;

      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockRejectedValue(new ServiceUnavailableException('GHN timeout')),
        queryOrderByClientCode: vi.fn().mockResolvedValue({
          carrierName: 'GHN',
          trackingNumber: 'L4RECOVERED',
          isMock: false,
          carrierStatus: 'ready_to_pick',
          statusNote: 'Đã khôi phục vận đơn thật từ GHN Sandbox theo mã đơn hàng.',
          expectedDeliveryAt: null,
        }),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );

      const res = await service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(res.isMock).toBe(false);
      expect(res.trackingNumber).toBe('L4RECOVERED');
      expect(res.fallbackUsed).toBeUndefined();
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ trackingNumber: 'L4RECOVERED', isMock: false }),
        }),
      );
    });

    it('mode AUTO khi createOrder timeout và tra cứu client_order_code cũng lỗi mạng thì ghi create_uncertain và báo 503, không tự tạo vận đơn mô phỏng lệch nhau', async () => {
      const orderRow = sampleOrderSnapshot();
      const upsert = vi.fn().mockResolvedValue({
        id: 'ship-intent-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: null,
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'create_uncertain',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;

      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockRejectedValue(new ServiceUnavailableException('fetch timeout')),
        queryOrderByClientCode: vi
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('lookup timeout')),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );

      await expect(
        service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      // Pha 1 ghi `creating`, Pha 2 chuyển sang `create_uncertain` (isMock=false, trackingNumber=null), tuyệt đối không tạo mock
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          create: expect.objectContaining({
            isMock: false,
            trackingNumber: null,
            carrierStatus: 'creating',
          }),
        }),
      );
      expect(upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          update: expect.objectContaining({
            isMock: false,
            trackingNumber: null,
            carrierStatus: 'create_uncertain',
          }),
        }),
      );
    });

    it('chặn thao tác mô phỏng thủ công (manualSimulation=true) trên vận đơn GHN thật (isMock=false)', async () => {
      const now = new Date();
      const update = vi.fn();
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                status: 'SHIPPED',
                shipment: {
                  id: 'ship-ghn-1',
                  orderId: 'ord-ghn-1',
                  carrierName: 'GHN',
                  trackingNumber: 'L4ABCDEF',
                  status: 'IN_TRANSIT',
                  isMock: false,
                  createdAt: now,
                  updatedAt: now,
                },
                items: [],
                payments: [],
              }),
            },
            shipment: { update },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma);

      await expect(
        service.updateShipmentStatus('ord-ghn-1', 'DELIVERED', 'admin-1', 'Bấm mô phỏng', {
          manualSimulation: true,
        }),
      ).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();
    });

    it('cho phép giao lại thành công từ FAILED (waiting_to_return) sang DELIVERED và chốt COD', async () => {
      const now = new Date();
      const currentShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'FAILED',
        isMock: false,
        carrierStatus: 'waiting_to_return',
        statusNote: 'Chờ hoàn',
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;
      const mockPayments = {
        record: vi.fn().mockResolvedValue(true),
      } as unknown as PaymentsService;
      const mockPrisma = {
        shipment: { findFirst: vi.fn().mockResolvedValue(currentShipment) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                status: 'SHIPPED',
                shipment: currentShipment,
                items: [],
                payments: [{ id: 'pay-cod-1', gateway: 'COD', status: 'PENDING' }],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue({
                ...currentShipment,
                status: 'DELIVERED',
                carrierStatus: 'delivered',
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders, undefined, mockPayments);
      const res = await service.handleGhnWebhook({
        OrderCode: 'L4ABCDEF',
        Status: 'delivered',
        Description: 'Giao lại thành công',
      });

      expect(res.processed).toBe(true);
      expect((res as { status?: string }).status).toBe('DELIVERED');
      expect(mockPayments.record).toHaveBeenCalledWith(
        'pay-cod-1',
        'SUCCEEDED',
        expect.stringMatching(/^COD:FR2611160001:[0-9a-f]{8}$/),
        expect.anything(),
        expect.anything(),
      );
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-ghn-1',
        'DELIVERED',
        expect.anything(),
        undefined,
        expect.objectContaining({ fromCarrierWebhook: true }),
      );
    });

    it('webhook GHN trạng thái scrap đi vào luồng sự cố FAILED, gửi thông báo và KHÔNG cộng lại tồn kho', async () => {
      const now = new Date();
      const currentShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'IN_TRANSIT',
        isMock: false,
        carrierStatus: 'delivering',
        statusNote: null,
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi.fn(),
      } as unknown as OrdersService;
      const mockInventory = { restock: vi.fn() } as unknown as InventoryService;
      const mockPayments = { record: vi.fn() } as unknown as PaymentsService;
      const mockNotifications = {
        notifyShipmentFailed: vi.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService;
      const mockPrisma = {
        shipment: { findFirst: vi.fn().mockResolvedValue(currentShipment) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                userId: 'u1',
                customerEmail: 'khach@freya.test',
                status: 'SHIPPED',
                shipment: currentShipment,
                items: [{ productVariantId: 'var-1', quantity: 2 }],
                payments: [{ id: 'pay-cod-1', gateway: 'COD', status: 'PENDING' }],
              }),
            },
            shipment: {
              update: vi.fn().mockResolvedValue({
                ...currentShipment,
                status: 'FAILED',
                carrierStatus: 'scrap',
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(
        mockPrisma,
        mockOrders,
        mockInventory,
        mockPayments,
        mockNotifications,
      );
      const res = await service.handleGhnWebhook({
        OrderCode: 'L4ABCDEF',
        Status: 'scrap',
      });

      expect(res.processed).toBe(true);
      expect((res as { status?: string }).status).toBe('FAILED');
      expect(mockInventory.restock).not.toHaveBeenCalled();
      expect(mockPayments.record).not.toHaveBeenCalled();
      expect(mockOrders.transition).not.toHaveBeenCalled();
      expect(mockNotifications.notifyShipmentFailed).toHaveBeenCalledTimes(1);
    });

    it('webhook GHN trạng thái picking chỉ cập nhật sub-status trong PENDING, chưa chuyển đơn sang SHIPPED', async () => {
      const now = new Date();
      const currentShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: null,
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi.fn(),
      } as unknown as OrdersService;
      const update = vi.fn().mockResolvedValue({
        ...currentShipment,
        carrierStatus: 'picking',
        statusNote: 'Tài xế GHN đang đến shop lấy hàng.',
      });
      const mockPrisma = {
        shipment: { findFirst: vi.fn().mockResolvedValue(currentShipment) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                status: 'PROCESSING',
                shipment: currentShipment,
                items: [],
                payments: [],
              }),
            },
            shipment: { update },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      const res = await service.handleGhnWebhook({
        OrderCode: 'L4ABCDEF',
        Status: 'picking',
      });

      expect(res.processed).toBe(true);
      expect((res as { status?: string }).status).toBe('PENDING');
      expect((res as { carrierStatus?: string }).carrierStatus).toBe('picking');
      expect(mockOrders.transition).not.toHaveBeenCalled();
    });

    it('webhook GHN fallback theo ClientOrderCode bỏ qua nếu bản ghi là mô phỏng hoặc khác mã vận đơn thật', async () => {
      const now = new Date();
      const mockShipmentRecord = {
        id: 'ship-mock-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: 'GHN-SBX-001',
        status: 'PENDING',
        isMock: true,
        createdAt: now,
        updatedAt: now,
      };
      const mockUpdate = vi.fn();
      const mockPrisma1 = {
        shipment: {
          findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(mockShipmentRecord),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR001',
                status: 'PROCESSING',
                shipment: mockShipmentRecord,
                items: [],
                payments: [],
              }),
            },
            shipment: { update: mockUpdate },
          }),
        ),
      } as unknown as PrismaService;

      const resMock = await new ShippingService(mockPrisma1).handleGhnWebhook({
        OrderCode: 'L4OTHER',
        ClientOrderCode: 'FR001',
        Status: 'delivered',
      });
      expect(resMock.processed).toBe(false);
      expect((resMock as { ignored?: boolean }).ignored).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();

      const realOtherTracking = {
        ...mockShipmentRecord,
        isMock: false,
        trackingNumber: 'L4CURRENT',
      };
      const mockPrisma2 = {
        shipment: {
          findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(realOtherTracking),
        },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-1',
                orderCode: 'FR001',
                status: 'SHIPPED',
                shipment: realOtherTracking,
                items: [],
                payments: [],
              }),
            },
            shipment: { update: mockUpdate },
          }),
        ),
      } as unknown as PrismaService;

      const resMismatch = await new ShippingService(mockPrisma2).handleGhnWebhook({
        OrderCode: 'L4STALE',
        ClientOrderCode: 'FR001',
        Status: 'delivered',
      });
      expect(resMismatch.processed).toBe(false);
      expect((resMismatch as { ignored?: boolean }).ignored).toBe(true);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('mode GHN báo lỗi 503 ngay khi chưa cấu hình token/shopId', async () => {
      const mockPrisma = {} as unknown as PrismaService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(false),
      } as unknown as GhnCarrierGateway;
      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );

      await expect(service.createShipment('ord-ghn-1', { mode: 'GHN' }, 'admin-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('syncShipmentFromCarrier đồng bộ sub-status GHN và chuyển trạng thái vận đơn + gửi notifyShipmentFailed khi FAILED', async () => {
      const now = new Date();
      const currentShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'IN_TRANSIT',
        isMock: false,
        carrierStatus: 'delivering',
        statusNote: 'Shipper đang giao',
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const updatedShipment = {
        ...currentShipment,
        status: 'FAILED',
        carrierStatus: 'delivery_fail',
        statusNote: 'Khách hẹn giao lại ngày mai',
      };

      const mockPrisma = {
        shipment: { findUnique: vi.fn().mockResolvedValue(currentShipment) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                userId: 'u1',
                customerEmail: 'khach@freya.test',
                status: 'SHIPPED',
                shipment: currentShipment,
                items: [],
                payments: [],
              }),
            },
            shipment: { update: vi.fn().mockResolvedValue(updatedShipment) },
          }),
        ),
      } as unknown as PrismaService;

      const mockNotifications = {
        notifyShipmentFailed: vi.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        queryOrder: vi.fn().mockResolvedValue({
          trackingNumber: 'L4ABCDEF',
          status: 'FAILED',
          carrierStatus: 'delivery_fail',
          note: 'Khách hẹn giao lại ngày mai',
        }),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        mockNotifications,
        mockGhn,
      );

      const res = await service.syncShipmentFromCarrier('ord-ghn-1', 'admin-1');

      expect(res.status).toBe('FAILED');
      expect(res.carrierStatus).toBe('delivery_fail');
      expect(mockNotifications.notifyShipmentFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          orderCode: 'FR2611160001',
          note: 'Khách hẹn giao lại ngày mai',
        }),
      );
    });

    it('handleGhnWebhook chuyển đổi payload GHN (OrderCode + Status=delivered) sang DELIVERED', async () => {
      const now = new Date();
      const mockShipment = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'IN_TRANSIT',
        isMock: false,
        carrierStatus: 'delivering',
        statusNote: null,
        expectedDeliveryAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const updatedShipment = { ...mockShipment, status: 'DELIVERED', carrierStatus: 'delivered' };

      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;

      const mockPrisma = {
        shipment: { findFirst: vi.fn().mockResolvedValue(mockShipment) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'ord-ghn-1',
                orderCode: 'FR2611160001',
                status: 'SHIPPED',
                shipment: mockShipment,
                items: [],
                payments: [],
              }),
            },
            shipment: { update: vi.fn().mockResolvedValue(updatedShipment) },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      const res = await service.handleGhnWebhook({
        OrderCode: 'L4ABCDEF',
        Status: 'delivered',
        Description: 'Giao hàng thành công',
      });

      expect(res.processed).toBe(true);
      expect((res as { status?: string }).status).toBe('DELIVERED');
      expect((res as { carrierStatus?: string }).carrierStatus).toBe('delivered');
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-ghn-1',
        'DELIVERED',
        expect.anything(),
        undefined,
        expect.objectContaining({ fromCarrierWebhook: true }),
      );
    });

    it('R2-P1.2: createOrder timeout + queryOrderByClientCode gặp HTTP 400 CLIENT_NOT_OWNER_OF_SHOP thì ghi create_uncertain và báo 503, không rơi sang mock', async () => {
      const orderRow = sampleOrderSnapshot();
      const upsert = vi.fn().mockResolvedValue({
        id: 'ship-intent-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: null,
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'create_uncertain',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockRejectedValue(new ServiceUnavailableException('GHN timeout')),
        queryOrderByClientCode: vi
          .fn()
          .mockRejectedValue(
            new GhnApiRejectedError(
              'GHN Sandbox từ chối hoặc gặp lỗi: Client không thuộc shop',
              400,
              400,
              'CLIENT_NOT_OWNER_OF_SHOP',
              'Client không thuộc shop',
            ),
          ),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );

      await expect(
        service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ isMock: false, carrierStatus: 'create_uncertain' }),
        }),
      );
      expect(upsert.mock.calls.every(([arg]) => arg.create?.isMock !== true)).toBe(true);

      // Kể cả khi createOrder trả 400 (ví dụ client_order_code đã tồn tại khi thử lại) mà lookup cũng lỗi -> vẫn báo 503, không tạo mock
      upsert.mockClear();
      const duplicate400Ghn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi
          .fn()
          .mockRejectedValue(
            new GhnApiRejectedError('Duplicate client_order_code', 400, 400, 'ORDER_EXISTED'),
          ),
        queryOrderByClientCode: vi
          .fn()
          .mockRejectedValue(new ServiceUnavailableException('lookup network timeout')),
      } as unknown as GhnCarrierGateway;
      await expect(
        new ShippingService(
          mockPrisma,
          undefined,
          undefined,
          undefined,
          undefined,
          duplicate400Ghn,
        ).createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(upsert.mock.calls.every(([arg]) => arg.create?.isMock !== true)).toBe(true);
    });

    it('R2-P1.3: chặn tạo vận đơn MOCK từ tab cũ ghi đè vận đơn GHN thật đang ở PENDING dưới khóa đơn', async () => {
      const now = new Date();
      const upsert = vi.fn();
      const mockOrders = { lock: vi.fn().mockResolvedValue(undefined) } as unknown as OrdersService;
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockResolvedValue({
                ...sampleOrderSnapshot(),
                shipment: {
                  id: 'ship-real-1',
                  orderId: 'ord-ghn-1',
                  carrierName: 'GHN',
                  trackingNumber: 'L4REALPENDING',
                  status: 'PENDING',
                  isMock: false,
                  createdAt: now,
                  updatedAt: now,
                },
              }),
            },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;

      const service = new ShippingService(mockPrisma, mockOrders);
      await expect(
        service.createShipment('ord-ghn-1', { mode: 'MOCK' }, 'admin-2'),
      ).rejects.toThrow(ConflictException);
      expect(mockOrders.lock).toHaveBeenCalledWith('ord-ghn-1', expect.anything());
      expect(upsert).not.toHaveBeenCalled();
    });

    it('R2-P2.4: khôi phục vận đơn GHN đã DELIVERED sẽ chạy luôn nhánh chuyển trạng thái đơn + chốt thu COD trong cùng transaction', async () => {
      const now = new Date();
      const orderRow = {
        ...sampleOrderSnapshot(),
        payments: [{ id: 'pay-cod-1', gateway: 'COD', status: 'PENDING' }],
      };
      const baseShipment = {
        id: 'ship-ghn-rec',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4RECDELIVERED',
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã khôi phục vận đơn thật từ GHN Sandbox theo mã đơn hàng.',
        expectedDeliveryAt: null,
        carrierUpdatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const deliveredShipment = {
        ...baseShipment,
        status: 'DELIVERED',
        carrierStatus: 'delivered',
        statusNote: 'GHN đã giao hàng thành công đến người nhận.',
        carrierUpdatedAt: new Date('2026-11-20T02:00:00.000Z'),
      };
      const mockOrders = {
        lock: vi.fn().mockResolvedValue(undefined),
        transition: vi.fn().mockResolvedValue(undefined),
      } as unknown as OrdersService;
      const mockPayments = {
        record: vi.fn().mockResolvedValue(true),
      } as unknown as PaymentsService;
      const update = vi.fn().mockResolvedValue(deliveredShipment);
      const mockPrisma = {
        order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(orderRow) },
            shipment: {
              upsert: vi.fn().mockResolvedValue(baseShipment),
              update,
            },
          }),
        ),
      } as unknown as PrismaService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockRejectedValue(new ServiceUnavailableException('GHN timeout')),
        queryOrderByClientCode: vi.fn().mockResolvedValue({
          carrierName: 'GHN',
          trackingNumber: 'L4RECDELIVERED',
          isMock: false,
          status: 'DELIVERED',
          carrierStatus: 'delivered',
          statusNote: 'GHN đã giao hàng thành công đến người nhận.',
          expectedDeliveryAt: null,
          occurredAt: '2026-11-20T02:00:00.000Z',
        }),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        mockOrders,
        undefined,
        mockPayments,
        undefined,
        mockGhn,
      );

      const res = await service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(res.status).toBe('DELIVERED');
      expect(res.carrierStatus).toBe('delivered');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DELIVERED',
            carrierStatus: 'delivered',
            carrierUpdatedAt: new Date('2026-11-20T02:00:00.000Z'),
          }),
        }),
      );
      expect(mockPayments.record).toHaveBeenCalledWith(
        'pay-cod-1',
        'SUCCEEDED',
        expect.stringMatching(/^COD:FR2611160001:[0-9a-f]{8}$/),
        expect.anything(),
        expect.anything(),
      );
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-ghn-1',
        'SHIPPED',
        expect.anything(),
        'admin-1',
      );
      expect(mockOrders.transition).toHaveBeenCalledWith(
        'ord-ghn-1',
        'DELIVERED',
        expect.anything(),
        'admin-1',
        expect.objectContaining({ trackingNumber: 'L4RECDELIVERED' }),
      );
    });

    it('R2-P2.5: syncShipmentFromCarrier trả dữ liệu cũ hơn (hoặc DB vừa đổi lúc đang sync) bị chặn 409, không ghi đè FAILED về IN_TRANSIT', async () => {
      const t0 = new Date('2026-11-20T01:00:00.000Z');
      const tWebhook = new Date('2026-11-20T01:05:00.000Z');
      const tNewer = new Date('2026-11-20T01:10:00.000Z');

      const failedShipment: {
        id: string;
        orderId: string;
        carrierName: string;
        trackingNumber: string;
        status: string;
        isMock: boolean;
        carrierStatus: string;
        statusNote: string;
        expectedDeliveryAt: null;
        carrierUpdatedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      } = {
        id: 'ship-ghn-1',
        orderId: 'ord-ghn-1',
        carrierName: 'GHN',
        trackingNumber: 'L4ABCDEF',
        status: 'FAILED',
        isMock: false,
        carrierStatus: 'waiting_to_return',
        statusNote: 'Chờ hoàn',
        expectedDeliveryAt: null,
        carrierUpdatedAt: tWebhook,
        createdAt: t0,
        updatedAt: tWebhook,
      };
      const update = vi.fn().mockResolvedValue({
        ...failedShipment,
        status: 'IN_TRANSIT',
        carrierStatus: 'delivering',
        carrierUpdatedAt: tNewer,
      });

      const makePrisma = (
        outsideShipment: typeof failedShipment,
        lockedShipment: typeof failedShipment,
      ) =>
        ({
          shipment: { findUnique: vi.fn().mockResolvedValue(outsideShipment) },
          $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
            fn({
              order: {
                findUnique: vi.fn().mockResolvedValue({
                  id: 'ord-ghn-1',
                  orderCode: 'FR2611160001',
                  status: 'SHIPPED',
                  shipment: lockedShipment,
                  items: [],
                  payments: [],
                }),
              },
              shipment: { update },
            }),
          ),
        }) as unknown as PrismaService;

      // Ca 1: Sync trả về delivering có updated_date CŨ HƠN (01:00 < 01:05) -> phải chặn 409
      const staleGhn = {
        configured: vi.fn().mockReturnValue(true),
        queryOrder: vi.fn().mockResolvedValue({
          trackingNumber: 'L4ABCDEF',
          status: 'IN_TRANSIT',
          carrierStatus: 'delivering',
          note: 'Đang giao (cũ)',
          occurredAt: t0.toISOString(),
        }),
      } as unknown as GhnCarrierGateway;
      await expect(
        new ShippingService(
          makePrisma(failedShipment, failedShipment),
          undefined,
          undefined,
          undefined,
          undefined,
          staleGhn,
        ).syncShipmentFromCarrier('ord-ghn-1', 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();

      // Ca 2: Sync thiếu updated_date và DB đã bị webhook cập nhật trong lúc sync đang bay (updatedAt > expectedUpdatedAt) -> chặn 409
      const beforeWebhookShipment = {
        ...failedShipment,
        status: 'IN_TRANSIT',
        carrierUpdatedAt: null,
        updatedAt: t0,
      };
      const afterWebhookNoCarrierTime = {
        ...failedShipment,
        carrierUpdatedAt: null,
        updatedAt: tWebhook,
      };
      const noTimeGhn = {
        configured: vi.fn().mockReturnValue(true),
        queryOrder: vi.fn().mockResolvedValue({
          trackingNumber: 'L4ABCDEF',
          status: 'IN_TRANSIT',
          carrierStatus: 'delivering',
          note: 'Đang giao',
        }),
      } as unknown as GhnCarrierGateway;
      await expect(
        new ShippingService(
          makePrisma(beforeWebhookShipment, afterWebhookNoCarrierTime),
          undefined,
          undefined,
          undefined,
          undefined,
          noTimeGhn,
        ).syncShipmentFromCarrier('ord-ghn-1', 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();

      // Ca 2b: Dù cả bản ghi cũ lẫn sync đều có carrierUpdatedAt/occurredAt (01:03 > 01:00),
      // nhưng webhook không kèm Time vừa cập nhật DB lên FAILED trong lúc sync đang bay (updatedAt > expectedUpdatedAt) -> vẫn phải chặn 409
      const beforeWebhookWithCarrierTime = {
        ...failedShipment,
        status: 'PENDING',
        carrierUpdatedAt: t0,
        updatedAt: t0,
      };
      const afterWebhookKeepingOldCarrierTime = {
        ...failedShipment,
        status: 'FAILED',
        carrierUpdatedAt: t0,
        updatedAt: tWebhook,
      };
      const midTimeGhn = {
        configured: vi.fn().mockReturnValue(true),
        queryOrder: vi.fn().mockResolvedValue({
          trackingNumber: 'L4ABCDEF',
          status: 'IN_TRANSIT',
          carrierStatus: 'delivering',
          note: 'Đang giao trước khi webhook FAILED tới',
          occurredAt: '2026-11-20T01:03:00.000Z',
        }),
      } as unknown as GhnCarrierGateway;
      await expect(
        new ShippingService(
          makePrisma(beforeWebhookWithCarrierTime, afterWebhookKeepingOldCarrierTime),
          undefined,
          undefined,
          undefined,
          undefined,
          midTimeGhn,
        ).syncShipmentFromCarrier('ord-ghn-1', 'admin-1'),
      ).rejects.toThrow(ConflictException);
      expect(update).not.toHaveBeenCalled();

      // Ca 3: Sync trả về delivering MỚI HƠN (01:10 > 01:05, giao lại thành công) -> cho phép chuyển sang IN_TRANSIT
      const newerGhn = {
        configured: vi.fn().mockReturnValue(true),
        queryOrder: vi.fn().mockResolvedValue({
          trackingNumber: 'L4ABCDEF',
          status: 'IN_TRANSIT',
          carrierStatus: 'delivering',
          note: 'Kích hoạt giao lại',
          occurredAt: tNewer.toISOString(),
        }),
      } as unknown as GhnCarrierGateway;
      const synced = await new ShippingService(
        makePrisma(failedShipment, failedShipment),
        undefined,
        undefined,
        undefined,
        undefined,
        newerGhn,
      ).syncShipmentFromCarrier('ord-ghn-1', 'admin-1');
      expect(synced.status).toBe('IN_TRANSIT');
      expect(update).toHaveBeenCalledTimes(1);
    });

    it('R3-P1.1: đơn CONFIRMED phải chốt chuyển sang PROCESSING và lưu intent creating dưới khóa TRƯỚC khi gọi ghn.createOrder', async () => {
      const now = new Date();
      const events: string[] = [];
      let currentStatus = 'CONFIRMED';
      const upsert = vi
        .fn()
        .mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
          events.push(`upsert:${String(create.carrierStatus)}`);
          return {
            id: 'ship-1',
            orderId: 'ord-ghn-1',
            carrierName: 'GHN',
            trackingNumber: create.trackingNumber ?? null,
            status: 'PENDING',
            isMock: false,
            carrierStatus: create.carrierStatus,
            createdAt: now,
            updatedAt: now,
          };
        });
      const mockOrders = {
        lock: vi.fn().mockImplementation(async () => void events.push('lock')),
        transition: vi.fn().mockImplementation(async (_id: string, next: string) => {
          events.push(`transition:${next}`);
          currentStatus = next;
        }),
      } as unknown as OrdersService;
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockImplementation(async () => ({
                ...sampleOrderSnapshot(),
                status: currentStatus,
              })),
            },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi.fn().mockImplementation(async () => {
          events.push(`ghnCreate(orderStatus=${currentStatus})`);
          return {
            carrierName: 'GHN',
            trackingNumber: 'L4LOCKED',
            isMock: false,
            status: 'PENDING',
            carrierStatus: 'ready_to_pick',
            statusNote: 'OK',
            expectedDeliveryAt: null,
          };
        }),
      } as unknown as GhnCarrierGateway;

      const service = new ShippingService(
        mockPrisma,
        mockOrders,
        undefined,
        undefined,
        undefined,
        mockGhn,
      );
      const res = await service.createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(res.trackingNumber).toBe('L4LOCKED');
      expect(events).toEqual([
        'lock',
        'transition:PROCESSING',
        'upsert:creating',
        'ghnCreate(orderStatus=PROCESSING)',
        'lock',
        'upsert:ready_to_pick',
      ]);
    });

    it('R3-P1.1: chặn yêu cầu tạo đồng thời khi intent creating còn hiệu lực; khi create_uncertain thì chặn MOCK và cho đối soát GHN trước khi tạo mới', async () => {
      const now = new Date();
      const activeCreating = {
        ...sampleOrderSnapshot(),
        shipment: {
          id: 'ship-int',
          orderId: 'ord-ghn-1',
          carrierName: 'GHN',
          trackingNumber: null,
          status: 'PENDING',
          isMock: false,
          carrierStatus: 'creating',
          createdAt: now,
          updatedAt: now,
        },
      };
      const createOrder = vi.fn();
      const mockGhnActive = {
        configured: vi.fn().mockReturnValue(true),
        createOrder,
      } as unknown as GhnCarrierGateway;
      const prismaActive = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(activeCreating) },
            shipment: { upsert: vi.fn() },
          }),
        ),
      } as unknown as PrismaService;

      await expect(
        new ShippingService(
          prismaActive,
          undefined,
          undefined,
          undefined,
          undefined,
          mockGhnActive,
        ).createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-2'),
      ).rejects.toThrow(ConflictException);
      expect(createOrder).not.toHaveBeenCalled();

      // Với intent create_uncertain: chặn MOCK 409, nhưng cho phép AUTO đối soát qua queryOrderByClientCode TRƯỚC (không gọi lại createOrder nếu đã tìm thấy)
      const uncertainOrder = {
        ...sampleOrderSnapshot(),
        shipment: {
          ...activeCreating.shipment,
          carrierStatus: 'create_uncertain:FR2611160001-R1A2B',
        },
      };
      const prismaUncertain = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(uncertainOrder) },
            shipment: {
              upsert: vi.fn().mockResolvedValue({
                ...uncertainOrder.shipment,
                trackingNumber: 'L4RECONCILED',
                carrierStatus: 'ready_to_pick',
              }),
            },
          }),
        ),
      } as unknown as PrismaService;

      await expect(
        new ShippingService(prismaUncertain).createShipment('ord-ghn-1', { mode: 'MOCK' }),
      ).rejects.toThrow(ConflictException);

      const queryOrderByClientCode = vi.fn().mockResolvedValue({
        carrierName: 'GHN',
        trackingNumber: 'L4RECONCILED',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
        statusNote: 'Khôi phục thành công',
        expectedDeliveryAt: null,
      });
      const reconcileGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder,
        queryOrderByClientCode,
      } as unknown as GhnCarrierGateway;

      const res = await new ShippingService(
        prismaUncertain,
        undefined,
        undefined,
        undefined,
        undefined,
        reconcileGhn,
      ).createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(queryOrderByClientCode).toHaveBeenCalledWith('FR2611160001-R1A2B');
      expect(createOrder).not.toHaveBeenCalled();
      expect(res.trackingNumber).toBe('L4RECONCILED');
    });

    it('R3-P1.1: mode GHN bị GHN từ chối và xác nhận chưa có đơn (null) thì dọn sạch intent creating thay vì để kẹt', async () => {
      const now = new Date();
      let storedShipment: Record<string, unknown> | null = null;
      const deleteMany = vi.fn().mockImplementation(async () => {
        storedShipment = null;
        return { count: 1 };
      });
      const upsert = vi
        .fn()
        .mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
          storedShipment = { id: 'ship-int', ...create, createdAt: now, updatedAt: now };
          return storedShipment;
        });
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockImplementation(async () => ({
                ...sampleOrderSnapshot(),
                shipment: storedShipment,
              })),
            },
            shipment: { upsert, deleteMany },
          }),
        ),
      } as unknown as PrismaService;
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder: vi
          .fn()
          .mockRejectedValue(new GhnApiRejectedError('Invalid address', 400, 400)),
        queryOrderByClientCode: vi.fn().mockResolvedValue(null),
      } as unknown as GhnCarrierGateway;

      await expect(
        new ShippingService(
          mockPrisma,
          undefined,
          undefined,
          undefined,
          undefined,
          mockGhn,
        ).createShipment('ord-ghn-1', { mode: 'GHN' }, 'admin-1'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(deleteMany).toHaveBeenCalledWith({ where: { orderId: 'ord-ghn-1' } });
      expect(storedShipment).toBeNull();
    });

    it('R3-P2.3: vận đơn GHN bị cancel trước lúc lấy hàng (PROCESSING) cho phép tạo vận đơn thay thế với client_order_code hậu tố -Rxxxx, nhưng bị chặn nếu đơn đã SHIPPED', async () => {
      const now = new Date();
      const cancelledBeforePickup = {
        ...sampleOrderSnapshot(),
        status: 'PROCESSING',
        shipment: {
          id: 'ship-old',
          orderId: 'ord-ghn-1',
          carrierName: 'GHN',
          trackingNumber: 'L4OLDCANCEL',
          status: 'FAILED',
          isMock: false,
          carrierStatus: 'cancel',
          createdAt: now,
          updatedAt: now,
        },
      };
      let stored: Record<string, unknown> = cancelledBeforePickup.shipment;
      const upsert = vi
        .fn()
        .mockImplementation(async ({ update }: { update: Record<string, unknown> }) => {
          stored = { ...stored, ...update };
          return stored;
        });
      const mockPrisma = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: {
              findUnique: vi.fn().mockImplementation(async () => ({
                ...cancelledBeforePickup,
                shipment: stored,
              })),
            },
            shipment: { upsert },
          }),
        ),
      } as unknown as PrismaService;
      const createOrder = vi.fn().mockResolvedValue({
        carrierName: 'GHN',
        trackingNumber: 'L4REPLACEMENT',
        isMock: false,
        status: 'PENDING',
        carrierStatus: 'ready_to_pick',
        statusNote: 'Đã tạo vận đơn thay thế',
        expectedDeliveryAt: null,
      });
      const mockGhn = {
        configured: vi.fn().mockReturnValue(true),
        createOrder,
      } as unknown as GhnCarrierGateway;

      const replaced = await new ShippingService(
        mockPrisma,
        undefined,
        undefined,
        undefined,
        undefined,
        mockGhn,
      ).createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1');

      expect(replaced.trackingNumber).toBe('L4REPLACEMENT');
      expect(replaced.status).toBe('PENDING');
      expect(createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderCode: expect.stringMatching(/^FR2611160001-R[0-9A-F]{4}$/),
        }),
      );

      // Nếu đơn đã SHIPPED (hàng đã rời kho) mà gặp cancel -> vẫn phải chặn tạo thay thế 409
      const shippedCancelled = {
        ...cancelledBeforePickup,
        status: 'SHIPPED',
      };
      const prismaShipped = {
        $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
          fn({
            order: { findUnique: vi.fn().mockResolvedValue(shippedCancelled) },
            shipment: { upsert: vi.fn() },
          }),
        ),
      } as unknown as PrismaService;
      await expect(
        new ShippingService(
          prismaShipped,
          undefined,
          undefined,
          undefined,
          undefined,
          mockGhn,
        ).createShipment('ord-ghn-1', { mode: 'AUTO' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
