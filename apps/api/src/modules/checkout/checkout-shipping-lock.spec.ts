import { ConflictException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import type { OrderDetails } from '../orders/index.js';
import { CheckoutService, isShipmentCreatingOrReconciling } from './checkout.service.js';
import { OrderAdminService } from './order-admin.service.js';

function makeOrder(overrides: Partial<OrderDetails> = {}): OrderDetails {
  const now = new Date('2026-11-20T10:00:00.000Z');
  return {
    id: 'ord-1',
    orderCode: 'FR2611200001',
    userId: 'user-1',
    customerEmail: 'customer@example.test',
    status: 'CONFIRMED',
    subtotalAmount: new Decimal('200000'),
    discountAmount: new Decimal('0'),
    shippingFeeAmount: new Decimal('30000'),
    totalAmount: new Decimal('230000'),
    shippingRateId: 'rate-1',
    shippingAddressSnapshot: {},
    idempotencyKey: 'idem-1',
    checkoutFingerprint: 'fp-1',
    paymentDueAt: null,
    voucherId: null,
    promotionId: null,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'item-1',
        orderId: 'ord-1',
        productVariantId: 'var-1',
        quantity: 1,
        unitPrice: new Decimal('200000'),
        lineTotal: new Decimal('200000'),
        productSnapshot: { name: 'Áo sơ mi', variantLabel: 'Trắng / M' },
      },
    ],
    payments: [
      {
        id: 'pay-1',
        orderId: 'ord-1',
        gateway: 'VNPAY',
        amount: new Decimal('230000'),
        status: 'SUCCEEDED',
        reference: 'REF-1',
        checkoutUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=REF-1',
        expiresAt: null,
        lastCheckedAt: null,
        createdAt: now,
        updatedAt: now,
        transactions: [],
      },
    ],
    statusHistory: [
      {
        id: 'hist-1',
        orderId: 'ord-1',
        fromStatus: 'PENDING_PAYMENT',
        status: 'CONFIRMED',
        actorUserId: 'user-1',
        note: null,
        createdAt: now,
      },
    ],
    shipment: null,
    ...overrides,
  } as unknown as OrderDetails;
}

describe('CheckoutService & OrderAdminService — khóa hai chiều giữa hoàn tiền và tạo vận đơn GHN (R5-P1)', () => {
  it('isShipmentCreatingOrReconciling nhận diện đúng bản ghi giữ chỗ creating, create_uncertain và vận đơn chưa có trackingNumber', () => {
    expect(isShipmentCreatingOrReconciling(null)).toBe(false);
    expect(
      isShipmentCreatingOrReconciling({
        isMock: false,
        trackingNumber: null,
        carrierStatus: 'creating#a1b2c3d4',
      }),
    ).toBe(true);
    expect(
      isShipmentCreatingOrReconciling({
        isMock: false,
        trackingNumber: null,
        carrierStatus: 'create_uncertain',
      }),
    ).toBe(true);
    expect(
      isShipmentCreatingOrReconciling({
        isMock: false,
        trackingNumber: 'L4REAL01',
        carrierStatus: 'ready_to_pick',
      }),
    ).toBe(false);
  });

  it('refundPayment và recordManualRefund từ chối 409 dưới khóa đơn khi đang tạo hoặc đối soát vận đơn (creating / create_uncertain), không gọi cổng thanh toán', async () => {
    const adapterRefund = vi.fn();
    const currentOrder = makeOrder({
      status: 'CONFIRMED',
      shipment: {
        id: 'ship-1',
        orderId: 'ord-1',
        carrierName: 'GHN',
        trackingNumber: null,
        status: 'PENDING',
        isMock: false,
        carrierStatus: 'creating#12345678',
        statusNote: 'Đang khởi tạo...',
        expectedDeliveryAt: null,
        carrierUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as OrderDetails['shipment'],
    });

    const txMock = {
      payment: {
        // claimRefund (refundPayment) doc bang findUnique, recordManualRefund bang findUniqueOrThrow.
        findUnique: vi.fn().mockResolvedValue(currentOrder.payments[0]),
        findUniqueOrThrow: vi.fn().mockResolvedValue(currentOrder.payments[0]),
      },
      order: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(currentOrder),
      },
      paymentTransaction: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
      },
    };

    const prismaMock = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(currentOrder.payments[0]),
      },
      $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    };
    const ordersMock = {
      lock: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(currentOrder),
    };
    const cartMock = {
      lockForCheckout: vi.fn().mockResolvedValue(undefined),
    };
    const paymentsMock = {
      gateways: {
        get: vi.fn().mockReturnValue({
          code: 'VNPAY',
          configured: () => true,
          refund: adapterRefund,
        }),
        // REFUND_GATEWAYS bat VNPAY (ADR-111): claimRefund moi toi duoc chot chan van don.
        autoRefund: vi.fn().mockReturnValue(true),
      },
    };

    const checkout = new CheckoutService(
      prismaMock as never,
      cartMock as never,
      {} as never,
      ordersMock as never,
      paymentsMock as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      checkout.refundPayment('pay-1', 'admin-1', { reason: 'Thử hoàn khi đang tạo GHN' }),
    ).rejects.toThrow(ConflictException);
    expect(ordersMock.lock).toHaveBeenCalledWith('ord-1', txMock);
    expect(adapterRefund).not.toHaveBeenCalled();
    expect(txMock.paymentTransaction.create).not.toHaveBeenCalled();

    await expect(
      checkout.recordManualRefund(
        'pay-1',
        'admin-1',
        { amount: '230000.00', reference: 'FT26112001', reason: 'Hoàn tay' },
        txMock as never,
      ),
    ).rejects.toThrow(ConflictException);
    expect(txMock.paymentTransaction.create).not.toHaveBeenCalled();
  });

  it('OrderAdminService.startProcessing từ chối 409 khi đơn CONFIRMED đang có lệnh hoàn tiền chờ kết quả (REFUND-INTENT RECEIVED)', async () => {
    const orderWithPendingRefund = makeOrder({
      status: 'CONFIRMED',
      payments: [
        {
          ...makeOrder().payments[0]!,
          transactions: [
            {
              id: 'ptx-1',
              paymentId: 'pay-1',
              gateway: 'VNPAY',
              externalTransactionId: 'REFUND-INTENT:00000000-0000-0000-0000-000000000099',
              status: 'RECEIVED',
              payload: { amount: '230000.00', actor: 'admin-1', reason: 'Hoàn', full: true },
              createdAt: new Date(),
            },
          ],
        },
      ] as unknown as OrderDetails['payments'],
    });

    const checkoutMock = {
      orders: {
        get: vi.fn().mockResolvedValue(orderWithPendingRefund),
        transition: vi.fn(),
      },
      payments: {
        gateways: {
          get: vi.fn().mockReturnValue({
            code: 'VNPAY',
            configured: () => true,
            refund: vi.fn(),
          }),
        },
      },
      selfRefundablePayment: vi.fn().mockReturnValue(null),
      view: vi.fn().mockReturnValue({ id: 'ord-1' }),
      withOrder: vi
        .fn()
        .mockImplementation(
          async (_id: string, _uid: string, work: (o: OrderDetails, tx: unknown) => unknown) =>
            work(orderWithPendingRefund, {}),
        ),
    };

    const adminService = new OrderAdminService(checkoutMock as never);
    const detail = await adminService.detail('ord-1');
    expect(detail.actions.startProcessing).toBe(false);

    await expect(adminService.startProcessing('ord-1', 'admin-1')).rejects.toThrow(
      ConflictException,
    );
    expect(checkoutMock.orders.transition).not.toHaveBeenCalled();
  });
});
