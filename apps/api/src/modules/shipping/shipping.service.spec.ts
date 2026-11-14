import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { InventoryService } from '../inventory/index.js';
import { type OrdersService, registerPostCommitHook } from '../orders/index.js';
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
        data: { status: 'FAILED' },
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
