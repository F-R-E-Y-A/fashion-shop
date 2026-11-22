import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';

import { toPage } from '../../common/pagination/page.response.js';
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import type { AdminOrderQuery, OrderDetails } from '../orders/index.js';
import {
  CheckoutService,
  isShipmentCreatingOrReconciling,
  REFUNDABLE,
  shipmentView,
} from './checkout.service.js';
import { refundSummary } from './refund-ledger.js';

const IN_DELIVERY: OrderStatus[] = ['PROCESSING', 'SHIPPED'];

/**
 * Van hanh don cho ADMIN (ADR-038): danh sach/chi tiet moi khach, va cac buoc shop bam tay khi chua
 * noi hang van chuyen. Moi buoc chay duoi khoa don cua CheckoutService va bang buoc hop le cua
 * Orders; nut tren man quan tri doc `actions` de khong mo thao tac ma may chu se tu choi.
 */
@Injectable()
export class OrderAdminService {
  constructor(private readonly checkout: CheckoutService) {}

  async list(query: AdminOrderQuery) {
    const { items, total } = await this.checkout.orders.adminList(query);
    return toPage(items.map(summary), total, query);
  }

  async detail(id: string) {
    return this.present(await this.checkout.orders.get(id));
  }

  /** Shop da goi khach xac nhan don COD: chot kho (SALE), tru gio, giao hang; tien thu khi giao. */
  confirmCod(id: string, actor: string) {
    return this.step(id, async (order, tx) => {
      if (order.status !== 'PENDING_CONFIRMATION' || codPayment(order)?.status !== 'PENDING')
        throw new ConflictException('Chỉ xác nhận đơn COD đang chờ xác nhận.');
      const items = this.checkout.stockItems(order);
      if (!(await this.checkout.inventory.commit(id, items, tx)))
        throw new ConflictException(
          'Hàng giữ cho đơn đã hết hạn hoặc không còn đủ tồn. Báo khách đặt lại.',
        );
      await this.checkout.orders.transition(id, 'PROCESSING', tx, actor);
      await this.checkout.cart.consumePurchased(order.userId!, items, tx);
    });
  }

  /** Don online da tra: shop bat dau dong goi. Tu day khach khong tu huy duoc nua. */
  startProcessing(id: string, actor: string) {
    return this.step(id, async (order, tx) => {
      if (order.status !== 'CONFIRMED')
        throw new ConflictException('Chỉ bắt đầu xử lý đơn đã thanh toán, chưa xử lý.');
      if (order.shipment)
        throw new ConflictException(
          'Đơn hàng đang có yêu cầu tạo hoặc đối soát vận đơn, vui lòng hoàn tất đối soát trước.',
        );
      if (hasPendingOrProcessedRefund(order))
        throw new ConflictException(
          'Đơn hàng đang có lệnh hoàn tiền chờ kết quả hoặc đã hoàn tiền, không thể bắt đầu xử lý.',
        );
      await this.checkout.orders.transition(id, 'PROCESSING', tx, actor);
    });
  }

  /**
   * Shop huy don online da tra truoc khi xu ly (khach goi bao huy, het hang...): tra kho va hoan
   * toan bo, cung duong voi khach tu huy. Don CONFIRMED khong hoan tay tung phan o man nay vi
   * hang van nam trong kho va don se ket, khong giao duoc (ADR-038).
   */
  async cancelRefund(id: string, actor: string, reason: string) {
    const order = await this.checkout.orders.get(id);
    if (!order.userId) throw new ConflictException('Đơn không có chủ sở hữu.');
    await this.checkout.cancelAndRefund(id, order.userId, actor, reason);
    return this.detail(id);
  }

  /** Da giao toi khach; voi COD day cung la luc ghi nhan tien mat da thu. */
  markDelivered(id: string, actor: string) {
    return this.step(id, async (order, tx) => {
      if (!IN_DELIVERY.includes(order.status))
        throw new ConflictException('Chỉ đánh dấu đã giao cho đơn đang giao.');
      if (hasRealCarrierShipment(order))
        throw new ConflictException(
          'Đơn hàng đang giao qua vận đơn GHN thật, chỉ chốt giao thành công qua đồng bộ GHN hoặc webhook.',
        );
      const cod = codPayment(order);
      if (cod?.status === 'PENDING')
        await this.checkout.payments.record(
          cod.id,
          'SUCCEEDED',
          `COD:${order.orderCode}:${randomUUID().slice(0, 8)}`,
          { collectedAt: new Date().toISOString(), actor },
          tx,
        );
      await this.checkout.orders.transition(id, 'DELIVERED', tx, actor);
    });
  }

  /**
   * Khach khong nhan hang COD: hang ve kho, payment COD FAILED (dem so lan bom cho codBlock), don
   * CANCELLED. Don tra truoc giao that bai can hoan tien va doi tra, khong di qua day.
   */
  deliveryFailed(id: string, actor: string, reason: string) {
    return this.step(id, async (order, tx) => {
      const cod = codPayment(order);
      if (!IN_DELIVERY.includes(order.status) || cod?.status !== 'PENDING')
        throw new ConflictException('Chỉ ghi giao thất bại cho đơn COD đang giao, chưa thu tiền.');
      if (hasRealCarrierShipment(order) && !isCancelledRealCarrierBeforePickup(order))
        throw new ConflictException(
          'Đơn hàng đang giao qua vận đơn GHN thật, không thể tự chốt giao thất bại hoặc hoàn kho khi GHN chưa xác nhận.',
        );
      await this.checkout.inventory.restock(id, this.checkout.stockItems(order), tx);
      await this.checkout.payments.record(
        cod.id,
        'FAILED',
        `COD-FAILED:${order.orderCode}`,
        { reason, actor, at: new Date().toISOString() },
        tx,
      );
      await this.checkout.promotions.releaseVoucherUsage(id, tx);
      await this.checkout.orders.transition(id, 'CANCELLED', tx, actor, {
        cancelSource: 'DELIVERY_FAILED',
        reason,
      });
    });
  }

  private async step(
    id: string,
    work: (order: OrderDetails, tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const initial = await this.checkout.orders.get(id);
    if (!initial.userId) throw new ConflictException('Đơn không có chủ sở hữu.');
    await this.checkout.withOrder(id, initial.userId, work);
    return this.detail(id);
  }

  /** Chi tiet cho ADMIN: view cua khach cong email, lich su, so hoan va thao tac hop le luc nay. */
  private present(order: OrderDetails) {
    const ledgers = order.payments.map((payment) => {
      const ledger = refundSummary(payment.transactions);
      const remaining = new Decimal(payment.amount).minus(ledger.refunded);
      // CONFIRMED: hang chua roi kho, dung cancelRefund (tra kho + hoan toan bo) thay vi hoan tay.
      // Don tra truoc luon hoan duoc: qua cong neu cong bat hoan tu dong, khong thi hoan tay (ADR-111).
      const refundable =
        payment.status === 'SUCCEEDED' &&
        !!payment.gateway &&
        payment.gateway !== 'COD' &&
        order.status !== 'CONFIRMED' &&
        !isShipmentCreatingOrReconciling(order.shipment) &&
        REFUNDABLE.includes(order.status) &&
        remaining.gt(0) &&
        !ledger.pending;
      return {
        paymentId: payment.id,
        gateway: payment.gateway,
        status: payment.status,
        amount: new Decimal(payment.amount).toFixed(2),
        refundedAmount: ledger.refunded.toFixed(2),
        refundableAmount: refundable ? remaining.toFixed(2) : null,
        refundMode: refundable
          ? this.checkout.autoRefund(payment.gateway)
            ? ('GATEWAY' as const)
            : ('MANUAL' as const)
          : null,
        refunds: ledger.refunds,
        pendingRefund: ledger.pending,
      };
    });
    const cod = codPayment(order);
    const realCarrier = hasRealCarrierShipment(order);
    const cancelledBeforePickup = isCancelledRealCarrierBeforePickup(order);
    return {
      ...this.checkout.view(order),
      // Admin can ma GHN va ghi chu goc de doi soat; ban cho khach da loc o view() (ADR-122).
      shipment: shipmentView(order.shipment, 'admin'),
      userId: order.userId,
      customerEmail: order.customerEmail,
      history: order.statusHistory.map((row) => ({
        status: row.status,
        at: row.createdAt.toISOString(),
        actorUserId: row.actorUserId,
      })),
      ledgers,
      actions: {
        confirmCod: order.status === 'PENDING_CONFIRMATION' && cod?.status === 'PENDING',
        startProcessing:
          order.status === 'CONFIRMED' && !order.shipment && !hasPendingOrProcessedRefund(order),
        cancelRefund: !!this.checkout.selfRefundablePayment(order),
        markDelivered: IN_DELIVERY.includes(order.status) && !realCarrier,
        deliveryFailed:
          IN_DELIVERY.includes(order.status) &&
          cod?.status === 'PENDING' &&
          (!realCarrier || cancelledBeforePickup),
      },
    };
  }
}

const hasPendingOrProcessedRefund = (order: OrderDetails) =>
  order.payments.some((payment) => {
    const ledger = refundSummary(payment.transactions);
    return Boolean(ledger.pending) || !ledger.refunded.isZero();
  });

const codPayment = (order: OrderDetails) =>
  order.payments.find((payment) => payment.gateway === 'COD');

const hasRealCarrierShipment = (order: OrderDetails) =>
  Boolean(order.shipment && order.shipment.isMock === false);

/**
 * GHN chỉ cho hủy vận đơn (`cancel`) trước khi shipper lấy hàng (`order.status === 'PROCESSING'`).
 * Khi đó `cancel` là trạng thái cuối bên GHN và hàng vẫn còn trong kho, nên admin được phép
 * chốt hủy đơn COD & hoàn kho (hoặc tạo vận đơn thay thế) sau khi xác nhận hàng tại kho.
 */
const isCancelledRealCarrierBeforePickup = (order: OrderDetails) =>
  Boolean(
    order.shipment &&
    order.shipment.isMock === false &&
    order.shipment.status === 'FAILED' &&
    order.shipment.carrierStatus === 'cancel' &&
    order.status === 'PROCESSING',
  );

function summary(order: OrderDetails) {
  const latest = order.payments[0];
  const ledgers = order.payments.map((payment) => refundSummary(payment.transactions));
  return {
    id: order.id,
    orderCode: order.orderCode,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    customerEmail: order.customerEmail,
    totalAmount: order.totalAmount.toFixed(2),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    gateway: latest?.gateway ?? null,
    paymentStatus: latest?.status ?? null,
    refundedAmount: ledgers
      .reduce((sum, ledger) => sum.plus(ledger.refunded), new Decimal(0))
      .toFixed(2),
    refundPending: ledgers.some((ledger) => !!ledger.pending),
  };
}
