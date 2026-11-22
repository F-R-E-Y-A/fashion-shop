import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';

import type { OrderDetails } from '../orders/index.js';
import { CheckoutService, customerShipmentNote } from './checkout.service.js';
import { OrderAdminService } from './order-admin.service.js';

type Shipment = NonNullable<OrderDetails['shipment']>;
const at = (iso: string) => new Date(iso);

function shipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: 'ship-1',
    orderId: 'ord-1',
    carrierName: 'GHN',
    trackingNumber: 'L4GHN555',
    status: 'IN_TRANSIT',
    isMock: false,
    carrierStatus: 'delivering',
    statusNote: 'Shipper GHN đang giao hàng đến người nhận.',
    expectedDeliveryAt: null,
    carrierUpdatedAt: null,
    createdAt: at('2026-11-21T03:00:00.000Z'),
    updatedAt: at('2026-11-21T05:00:00.000Z'),
    ...overrides,
  } as unknown as Shipment;
}

function makeOrder(overrides: Partial<OrderDetails> = {}): OrderDetails {
  return {
    id: 'ord-1',
    orderCode: 'FR2611210001',
    userId: 'user-1',
    customerEmail: 'customer@example.test',
    status: 'SHIPPED',
    subtotalAmount: new Decimal('200000'),
    discountAmount: new Decimal('0'),
    shippingFeeAmount: new Decimal('30000'),
    totalAmount: new Decimal('230000'),
    shippingAddressSnapshot: {},
    checkoutFingerprint: 'fp-1',
    paymentDueAt: null,
    createdAt: at('2026-11-21T01:00:00.000Z'),
    updatedAt: at('2026-11-21T05:00:00.000Z'),
    items: [],
    payments: [],
    statusHistory: [
      {
        status: 'PENDING_CONFIRMATION',
        actorUserId: 'user-1',
        createdAt: at('2026-11-21T01:00:00.000Z'),
      },
      { status: 'PROCESSING', actorUserId: 'admin-1', createdAt: at('2026-11-21T02:00:00.000Z') },
      { status: 'SHIPPED', actorUserId: null, createdAt: at('2026-11-21T04:00:00.000Z') },
    ],
    shipment: shipment(),
    ...overrides,
  } as unknown as OrderDetails;
}

const checkoutWith = (order: OrderDetails) =>
  new CheckoutService(
    {} as never,
    {} as never,
    {} as never,
    { get: vi.fn().mockResolvedValue(order) } as never,
    { gateways: { get: vi.fn() } } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

describe('UC-07.3 trang đơn của khách: mốc trạng thái và vận đơn đã lọc (ADR-122)', () => {
  it('UC-07.3/AC7 view() trả lịch sử trạng thái cũ trước mới sau kèm giờ, không lộ người thao tác', () => {
    const view = checkoutWith(makeOrder()).view(makeOrder());
    expect(view.history).toEqual([
      { status: 'PENDING_CONFIRMATION', at: '2026-11-21T01:00:00.000Z' },
      { status: 'PROCESSING', at: '2026-11-21T02:00:00.000Z' },
      { status: 'SHIPPED', at: '2026-11-21T04:00:00.000Z' },
    ]);
    expect(JSON.stringify(view)).not.toContain('actorUserId');
  });

  it('UC-07.3/AC9 ghi chú admin gõ tay trên vận đơn đã có mã không tới khách; admin vẫn thấy nguyên văn', async () => {
    const adminNote = 'Admin: gọi lại khách, GHN báo sai số nhà — đừng hoàn kho';
    const order = makeOrder({
      shipment: shipment({ status: 'FAILED', carrierStatus: 'delivering', statusNote: adminNote }),
    });
    const checkout = checkoutWith(order);

    const customer = checkout.view(order).shipment!;
    expect(customer.carrierStatus).toBeNull();
    // Ma 'delivering' cu khong khop FAILED (admin cap nhat tay): khong doan ghi chu.
    expect(customer.statusNote).toBeNull();
    expect(JSON.stringify(checkout.view(order))).not.toContain('đừng hoàn kho');

    const admin = (await new OrderAdminService(checkout).detail('ord-1')).shipment!;
    expect(admin.carrierStatus).toBe('delivering');
    expect(admin.statusNote).toBe(adminNote);
    expect((await new OrderAdminService(checkout).detail('ord-1')).history[0]?.actorUserId).toBe(
      'user-1',
    );
  });

  it('UC-07.3/AC9 ghi chú khách suy ra từ mã GHN; mã cần shop đối soát thay bằng câu trung tính', () => {
    expect(customerShipmentNote(shipment())).toBe('Shipper GHN đang giao hàng đến người nhận.');
    for (const code of ['cancel', 'exception', 'scrap']) {
      const note = customerShipmentNote(
        shipment({ status: 'FAILED', carrierStatus: code, statusNote: 'cần shop đối soát' }),
      );
      expect(note).toBe('Vận đơn gặp sự cố; shop sẽ liên hệ với bạn.');
    }
    expect(
      customerShipmentNote(
        shipment({
          status: 'PENDING',
          carrierStatus: 'mock_ready_to_pick',
          statusNote: 'Vận đơn mô phỏng Sandbox nội bộ.',
        }),
      ),
    ).toBeNull();
  });

  it('UC-07.3/AC9 vận đơn đang tạo hoặc chờ đối soát chỉ báo đang tạo, không lộ mã giữ chỗ hay hướng dẫn nút admin', () => {
    for (const carrierStatus of ['creating#a1b2c3d4', 'create_uncertain:FRX1', 'uncertain_ghn']) {
      const order = makeOrder({
        status: 'CONFIRMED',
        shipment: shipment({
          trackingNumber: null,
          status: 'PENDING',
          carrierStatus,
          statusNote: 'Chưa rõ kết quả GHN; bấm "Đối soát vận đơn" trước khi tạo lại.',
        }),
      });
      const view = checkoutWith(order).view(order).shipment!;
      expect(view.carrierStatus).toBeNull();
      expect(view.statusNote).toBe(
        'Shop đang tạo vận đơn với đơn vị vận chuyển; mã vận đơn sẽ sớm được cập nhật.',
      );
    }
  });
});
