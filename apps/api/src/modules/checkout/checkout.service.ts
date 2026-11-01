import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartService } from '../cart/index.js';
import { InventoryService } from '../inventory/index.js';
import { type OrderDetails, OrdersService } from '../orders/index.js';
import { type GatewayCode, PaymentsService, SETTLEMENT_BUFFER_MINUTES } from '../payments/index.js';
import { ShippingService } from '../shipping/index.js';
import { CheckoutAddressService } from '../users/index.js';

const HOLD_MINUTES = 15;
/** COD khong co han thanh toan: giu hang cho cua so van hanh, qua han nay worker tu huy. */
const COD_HOLD_DAYS = 3;
/** Don da thu tien, ke ca da hoan mot phan, moi duoc hoan tiep. */
const REFUNDABLE: OrderStatus[] = [
  'CONFIRMED',
  'PAYMENT_REVIEW',
  'DELIVERED',
  'PARTIALLY_REFUNDED',
];
const REFUND_INTENT = 'REFUND-INTENT:';
/** Lon hon timeout goi Refund API (8 giay) de lenh treo do sap process van chot duoc. */
const REFUND_IN_FLIGHT_MS = 60_000;

const intentKey = (gateway: string, externalTransactionId: string) => ({
  gateway_externalTransactionId: { gateway, externalTransactionId },
});
const pendingRefund = () =>
  new ConflictException({
    error: 'REFUND_PENDING',
    message: 'Có lệnh hoàn chưa rõ kết quả từ cổng. Đối soát và chốt lệnh đó trước khi hoàn tiếp.',
  });

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  constructor(
    private readonly prisma: PrismaService,
    readonly cart: CartService,
    readonly inventory: InventoryService,
    readonly orders: OrdersService,
    readonly payments: PaymentsService,
    private readonly addresses: CheckoutAddressService,
    private readonly shipping: ShippingService,
  ) {}

  async quote(userId: string, addressId: string, tx: Prisma.TransactionClient) {
    const items = (await this.cart.checkoutSelection(userId, tx)).sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );
    if (!items.length || items.some((item) => !item.canCheckout))
      throw new UnprocessableEntityException(
        'Chọn sản phẩm đủ tồn kho trong giỏ trước khi thanh toán.',
      );
    const address = await this.addresses.get(userId, addressId, tx);
    const subtotalAmount = items
      .reduce((sum, item) => sum.plus(new Decimal(item.price).times(item.quantity)), new Decimal(0))
      .toFixed(2);
    const shipping = await this.shipping.quote(address.administrativeAreaId, subtotalAmount, tx);
    const totalAmount = new Decimal(subtotalAmount).plus(shipping.fee).toFixed(2);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          address,
          items: items.map(({ variantId, price, quantity }) => ({
            variantId,
            price: new Decimal(price).toFixed(2),
            quantity,
          })),
          subtotalAmount,
          shipping,
          discount: '0.00',
        }),
      )
      .digest('hex');
    return {
      fingerprint,
      address,
      items,
      subtotalAmount,
      discountAmount: '0.00',
      shippingFeeAmount: shipping.fee,
      shippingRateId: shipping.rateId,
      totalAmount,
      paymentConfigured: this.payments.gateways.list().some((gateway) => gateway.configured),
      gateways: this.payments.gateways.list(),
      holdMinutes: HOLD_MINUTES,
      payMinutes: HOLD_MINUTES - SETTLEMENT_BUFFER_MINUTES,
    };
  }

  preview(userId: string, addressId: string) {
    return this.prisma.$transaction(async (tx) => {
      const pending = await this.orders.pending(userId, tx);
      try {
        const quote = await this.quote(userId, addressId, tx);
        return {
          ...quote,
          pendingOrder: pending ? { id: pending.id, orderCode: pending.orderCode } : null,
        };
      } catch (error) {
        // Don cho dang giu don vi cuoi nen gio thay het hang: chi ra don do, khong bao khach chon lai gio.
        if (pending && error instanceof UnprocessableEntityException)
          throw new ConflictException({
            error: 'PENDING_ORDER_EXISTS',
            message: `Bạn còn đơn ${pending.orderCode} đang chờ thanh toán và đang giữ hàng trong giỏ. Tiếp tục hoặc hủy đơn đó trước khi đặt đơn mới.`,
          });
        throw error;
      }
    });
  }

  async create(
    user: { id: string; email: string },
    input: {
      addressId: string;
      fingerprint: string;
      idempotencyKey: string;
      gateway?: GatewayCode;
    },
    ip: string,
  ) {
    const code = input.gateway ?? 'VNPAY';
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`checkout:${input.idempotencyKey}`}, 0))`;
        await this.cart.lockForCheckout(user.id, tx);
        const prior = await this.orders.byKey(input.idempotencyKey, tx);
        if (prior) {
          if (
            prior.userId !== user.id ||
            prior.checkoutFingerprint !== input.fingerprint ||
            (prior.shippingAddressSnapshot as { id?: string }).id !== input.addressId ||
            prior.payments[0]?.gateway !== code
          )
            throw new ConflictException('Mã yêu cầu đã sử dụng cho nội dung khác.');
          return this.view(prior);
        }
        // Mot don giu hang moi khach: don thu hai co the bi tra tien cung luc va mua trung.
        const pending = await this.orders.pending(user.id, tx);
        if (pending) {
          if (pending.checkoutFingerprint !== input.fingerprint)
            throw new ConflictException({
              error: 'PENDING_ORDER_EXISTS',
              message:
                'Bạn còn một đơn đang chờ thanh toán. Tiếp tục hoặc hủy đơn đó trước khi đặt đơn mới.',
            });
          if (pending.payments[0]?.gateway !== code)
            throw new ConflictException(
              'Đơn chờ đang dùng cổng khác. Tiếp tục đơn đó hoặc hủy trước khi đổi cổng.',
            );
          return this.view(pending);
        }
        const quote = await this.quote(user.id, input.addressId, tx);
        if (quote.fingerprint !== input.fingerprint)
          throw new ConflictException({
            error: 'QUOTE_CHANGED',
            message: 'Giá, giỏ hàng hoặc địa chỉ đã đổi. Kiểm tra và xác nhận lại.',
          });
        const cod = code === 'COD';
        const due = new Date(Date.now() + (cod ? COD_HOLD_DAYS * 24 * 60 : HOLD_MINUTES) * 60_000);
        const order = await this.orders.create(
          {
            userId: user.id,
            email: user.email,
            key: input.idempotencyKey,
            fingerprint: quote.fingerprint,
            due,
            status: cod ? 'PENDING_CONFIRMATION' : undefined,
            address: quote.address,
            shippingRateId: quote.shippingRateId,
            subtotal: quote.subtotalAmount,
            shipping: quote.shippingFeeAmount,
            total: quote.totalAmount,
            items: quote.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              price: item.price,
              snapshot: {
                name: item.name,
                variantLabel: item.variantLabel,
                imageUrl: item.imageUrl,
                productSlug: item.productSlug,
              },
            })),
          },
          tx,
        );
        // Chi validate/ky local; loi cau hinh rollback don va hold. MoMo goi mang sau commit.
        await this.payments.create(
          order.id,
          input.idempotencyKey,
          quote.totalAmount,
          due,
          ip,
          tx,
          code,
        );
        await this.inventory.reserve(order.id, quote.items, due, tx);
        return this.view(await this.orders.get(order.id, user.id, tx));
      },
      { timeout: 15_000 },
    );
    if (code !== 'COD') await this.payments.launchLatest(result.id, ip);
    return this.view(await this.orders.get(result.id, user.id));
  }

  view(order: OrderDetails) {
    return {
      id: order.id,
      orderCode: order.orderCode,
      checkoutFingerprint: order.checkoutFingerprint,
      status: order.status,
      paymentDueAt: order.paymentDueAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      address: order.shippingAddressSnapshot,
      subtotalAmount: order.subtotalAmount.toFixed(2),
      discountAmount: order.discountAmount.toFixed(2),
      shippingFeeAmount: order.shippingFeeAmount.toFixed(2),
      totalAmount: order.totalAmount.toFixed(2),
      items: order.items.map((item) => ({
        variantId: item.productVariantId,
        quantity: item.quantity,
        price: item.unitPrice.toFixed(2),
        snapshot: item.productSnapshot,
      })),
      payments: order.payments.map((payment) => ({
        id: payment.id,
        gateway: payment.gateway,
        reference: payment.reference,
        status: payment.status,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        checkoutUrl:
          order.status === 'PENDING_PAYMENT' &&
          payment.status === 'PENDING' &&
          payment.expiresAt &&
          payment.expiresAt > new Date()
            ? payment.checkoutUrl
            : null,
      })),
    };
  }

  async withOrder<T>(
    id: string,
    userId: string,
    work: (order: OrderDetails, tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.cart.lockForCheckout(userId, tx);
        await this.orders.lock(id, tx);
        return work(await this.orders.get(id, userId, tx), tx);
      },
      { timeout: 15_000 },
    );
  }

  stockItems(order: OrderDetails) {
    return order.items.map((item) => ({
      variantId: item.productVariantId,
      quantity: item.quantity,
    }));
  }

  async cancel(id: string, userId: string, expired = false) {
    await this.withOrder(id, userId, async (order, tx) => {
      const cancellable =
        order.status === 'PENDING_PAYMENT' || order.status === 'PENDING_CONFIRMATION';
      if (!cancellable) {
        if (!expired && order.status !== 'CANCELLED')
          throw new ConflictException('Đơn đã ghi nhận thanh toán, không thể hủy tại đây.');
        return;
      }
      if (expired && order.paymentDueAt && order.paymentDueAt > new Date()) return;
      const items = this.stockItems(order);
      await this.inventory.release(id, items, tx);
      await this.cart.reselectReleased(
        userId,
        items.map((item) => item.variantId),
        tx,
      );
      await this.payments.expire(id, expired ? 'EXPIRED' : 'CANCELLED', tx);
      await this.orders.transition(id, 'CANCELLED', tx, expired ? undefined : userId);
    });
    return this.view(await this.orders.get(id, userId));
  }

  /**
   * COD: nhan vien da giao va thu tien mat — chot giong IPN thanh toan online:
   * payment SUCCEEDED, commit kho mot lan, don CONFIRMED, gio chi tru dung luong mua.
   */
  async codCollected(id: string, actorUserId: string) {
    const initial = await this.orders.get(id);
    if (!initial.userId) throw new ConflictException('Đơn không có chủ sở hữu.');
    if (initial.status !== 'PENDING_CONFIRMATION' || initial.payments[0]?.gateway !== 'COD')
      throw new ConflictException('Chỉ chốt thu tiền cho đơn COD đang chờ xử lý.');
    await this.withOrder(id, initial.userId, async (order, tx) => {
      if (order.status !== 'PENDING_CONFIRMATION')
        throw new ConflictException('Đơn đã được xử lý.');
      const payment = order.payments[0]!;
      await this.payments.record(
        payment.id,
        'SUCCEEDED',
        `COD:${order.orderCode}:${randomUUID().slice(0, 8)}`,
        { collectedAt: new Date().toISOString(), actor: actorUserId },
        tx,
      );
      const items = this.stockItems(order);
      if (!(await this.inventory.commit(id, items, tx)))
        throw new ConflictException('Hàng giữ cho đơn không còn hợp lệ.');
      await this.orders.transition(id, 'CONFIRMED', tx, actorUserId);
      await this.cart.consumePurchased(order.userId!, items, tx);
    });
    return this.view(await this.orders.get(id, initial.userId));
  }

  /**
   * Hoan tien qua Refund API cua cong, ba buoc de khong hoan trung khi admin bam lap hay hai
   * admin cung thao tac:
   * 1. Duoi khoa don: tinh so con lai va ghi intent RECEIVED. Con intent RECEIVED thi tu choi
   *    lenh moi, vi cong co the da hoan ma app chua biet.
   * 2. Goi cong NGOAI transaction.
   * 3. Duoi khoa don: ghi REFUND:{requestId}, intent PROCESSED, don REFUNDED/PARTIALLY_REFUNDED.
   * Cong khong tra 00 hoac khong toi duoc thi intent giu RECEIVED (fail closed) cho admin doi
   * chieu va chot bang resolveRefund. Hang da ban khong tu tra kho — thuoc luong doi tra (Return).
   */
  async refundPayment(
    paymentId: string,
    actor: string,
    input: { amount?: string; reason?: string },
  ) {
    const { order, userId, adapter } = await this.refundTarget(paymentId);
    if (!adapter.refund)
      throw new ConflictException(`Cổng ${adapter.code} chưa hỗ trợ hoàn tiền tự động.`);
    const claim = await this.withOrder(order.id, userId, async (current, tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (payment.status !== 'SUCCEEDED')
        throw new ConflictException('Chỉ hoàn tiền cho thanh toán đã thành công.');
      if (!REFUNDABLE.includes(current.status))
        throw new ConflictException('Đơn không ở trạng thái cho phép hoàn tiền.');
      const ledger = await this.refundLedger(paymentId, tx);
      if (ledger.pending) throw pendingRefund();
      const remaining = payment.amount.minus(ledger.refunded);
      if (remaining.lte(0)) throw new ConflictException('Thanh toán đã được hoàn đủ.');
      const amount = new Decimal(input.amount ?? remaining.toFixed(2));
      if (amount.lte(0) || amount.gt(remaining))
        throw new ConflictException(
          `Số hoàn tối đa là ${remaining.toFixed(2)}. Sử dụng số nhỏ hơn hoặc bằng.`,
        );
      const payload = {
        amount: amount.toFixed(2),
        actor,
        reason: input.reason ?? null,
        // Dac ta VNPAY: 02 hoan toan phan giao dich, nen chi dung khi hoan tron so da thu lan dau.
        full: ledger.refunded.isZero() && amount.eq(payment.amount),
      };
      // Receipt thanh cong settle da ghi la so giao dich cua cong (vnp_TransactionNo).
      const transactionNo = (
        await tx.paymentTransaction.findMany({ where: { paymentId, status: 'PROCESSED' } })
      ).find((row) => /^\d+$/u.test(row.externalTransactionId))?.externalTransactionId;
      const intentId = `${REFUND_INTENT}${randomUUID()}`;
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          gateway: payment.gateway!,
          externalTransactionId: intentId,
          status: 'RECEIVED',
          payload,
        },
      });
      return { intentId, payload, payment, transactionNo };
    });
    const { intentId, payload, payment, transactionNo } = claim;
    let result: Awaited<ReturnType<NonNullable<typeof adapter.refund>>>;
    try {
      result = await adapter.refund({
        reference: payment.reference!,
        checkoutUrl: payment.checkoutUrl!,
        amount: payload.amount,
        actor,
        full: payload.full,
        transactionNo,
      });
    } catch (error) {
      // Timeout, phan hoi sai chu ky hay ma loi deu khong chung minh cong chua hoan: giu intent.
      const message = error instanceof Error ? error.message : 'Cổng không phản hồi.';
      await this.prisma.paymentTransaction.update({
        where: intentKey(payment.gateway!, intentId),
        data: { payload: { ...payload, lastError: message } },
      });
      throw new ServiceUnavailableException({
        error: 'REFUND_PENDING',
        message: `${message} Lệnh hoàn được giữ chờ đối soát; kiểm tra trên cổng rồi chốt kết quả trước khi hoàn tiếp.`,
      });
    }
    await this.settleRefund(order.id, userId, payment.gateway!, intentId, actor, {
      receipt: `REFUND:${result.requestId}`,
      payload: result.payload,
    });
    return this.view(await this.orders.get(order.id, userId));
  }

  /**
   * Chot tay lenh hoan RECEIVED sau khi admin doi chieu tren cong: SUCCEEDED ghi so hoan nhu
   * phan hoi 00, FAILED dong intent de duoc hoan lai. Cung khoa don voi refundPayment.
   */
  async resolveRefund(
    paymentId: string,
    actor: string,
    input: { outcome: 'SUCCEEDED' | 'FAILED'; note: string },
  ) {
    const { order, userId } = await this.refundTarget(paymentId);
    const pending = (await this.refundLedger(paymentId, this.prisma)).pending;
    if (!pending) throw new ConflictException('Không có lệnh hoàn nào chờ đối soát.');
    // Lenh chua co lastError va con moi co the van dang cho cong: chot luc nay roi hoan lai la hoan trung.
    const answered =
      !!(pending.payload as { lastError?: string } | null)?.lastError ||
      pending.createdAt.getTime() < Date.now() - REFUND_IN_FLIGHT_MS;
    if (!answered)
      throw new ConflictException({
        error: 'REFUND_IN_FLIGHT',
        message: 'Lệnh hoàn đang chờ cổng trả lời. Thử lại sau ít phút.',
      });
    const resolution = { outcome: input.outcome, note: input.note, resolvedBy: actor };
    if (input.outcome === 'SUCCEEDED')
      await this.settleRefund(
        order.id,
        userId,
        pending.gateway,
        pending.externalTransactionId,
        actor,
        {
          receipt: `REFUND:MANUAL:${pending.id}`,
          payload: { resolution: JSON.stringify(resolution) },
        },
      );
    else
      await this.withOrder(order.id, userId, async (_current, tx) => {
        const changed = await tx.paymentTransaction.updateMany({
          where: { id: pending.id, status: 'RECEIVED' },
          data: {
            status: 'FAILED',
            payload: { ...(pending.payload as Prisma.JsonObject), resolution },
          },
        });
        if (changed.count !== 1) throw new ConflictException('Lệnh hoàn đã được chốt.');
      });
    return this.view(await this.orders.get(order.id, userId));
  }

  private async refundTarget(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ConflictException('Không tìm thấy thanh toán.');
    const order = await this.orders.get(payment.orderId);
    if (!order.userId) throw new ConflictException('Đơn không có chủ sở hữu.');
    const adapter = this.payments.gateways.get(payment.gateway as GatewayCode);
    return { order, userId: order.userId, adapter };
  }

  /** Tong da hoan chi dem REFUND:* (da xac nhan); intent RECEIVED la lenh chua ro ket qua. */
  private async refundLedger(paymentId: string, db: Prisma.TransactionClient) {
    const rows = await db.paymentTransaction.findMany({
      where: {
        paymentId,
        OR: [
          { externalTransactionId: { startsWith: 'REFUND:' } },
          { externalTransactionId: { startsWith: REFUND_INTENT }, status: 'RECEIVED' },
        ],
      },
    });
    const refunded = rows
      .filter((row) => row.externalTransactionId.startsWith('REFUND:'))
      .reduce((sum, row) => {
        const payload = row.payload as { refundedAmount?: string; vnp_Amount?: string } | null;
        // Ban ghi truoc so hoan chi co vnp_Amount (don vi x100) cua VNPAY.
        const amount = payload?.refundedAmount
          ? new Decimal(payload.refundedAmount)
          : new Decimal(payload?.vnp_Amount ?? '0').div(100);
        return sum.plus(amount);
      }, new Decimal(0));
    return {
      refunded,
      pending: rows.find((row) => row.externalTransactionId.startsWith(REFUND_INTENT)),
    };
  }

  private settleRefund(
    orderId: string,
    userId: string,
    gateway: string,
    intentId: string,
    actor: string,
    result: { receipt: string; payload: Record<string, string> },
  ) {
    return this.withOrder(orderId, userId, async (current, tx) => {
      const intent = await tx.paymentTransaction.findUniqueOrThrow({
        where: intentKey(gateway, intentId),
      });
      if (intent.status !== 'RECEIVED') {
        // Cong da xac nhan nhung lenh bi chot truoc do: tien co the da ra hai lan, can doi soat tay.
        this.logger.error(`Refund ${result.receipt} confirmed after ${intentId} was closed.`);
        throw new ConflictException('Lệnh hoàn đã được chốt.');
      }
      const claim = intent.payload as { amount: string; reason: string | null };
      await tx.paymentTransaction.create({
        data: {
          paymentId: intent.paymentId,
          gateway,
          externalTransactionId: result.receipt,
          status: 'PROCESSED',
          payload: {
            ...result.payload,
            reason: claim.reason,
            refundedAmount: claim.amount,
            intentId,
          },
        },
      });
      await tx.paymentTransaction.update({
        where: { id: intent.id },
        data: { status: 'PROCESSED' },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: intent.paymentId } });
      const { refunded } = await this.refundLedger(payment.id, tx);
      await this.orders.transition(
        current.id,
        refunded.gte(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        tx,
        actor,
      );
    });
  }

  async retry(id: string, userId: string, key: string, ip: string) {
    await this.withOrder(id, userId, async (order, tx) => {
      if (
        order.status !== 'PENDING_PAYMENT' ||
        !order.paymentDueAt ||
        order.paymentDueAt <= new Date()
      )
        throw new ConflictException('Đơn không còn trong thời hạn thanh toán.');
      const current = await this.payments.latest(id, tx);
      // An uncertain/pending attempt must be reused, never start a second charge after a timeout.
      if (!current || current.status === 'FAILED')
        await this.payments.create(
          id,
          key,
          order.totalAmount.toFixed(2),
          order.paymentDueAt,
          ip,
          tx,
          (current?.gateway ?? 'VNPAY') as GatewayCode,
        );
      return this.view(await this.orders.get(id, userId, tx));
    });
    await this.payments.launchLatest(id, ip);
    return this.view(await this.orders.get(id, userId));
  }
}
