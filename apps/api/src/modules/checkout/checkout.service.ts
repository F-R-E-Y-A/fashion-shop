import { createHash, randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import type { Env } from '../../infra/config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { CartService } from '../cart/index.js';
import { InventoryService } from '../inventory/index.js';
import {
  attachPostCommitHooks,
  type OrderDetails,
  OrdersService,
  type PostCommitHook,
  runPostCommitHooks,
} from '../orders/index.js';
import {
  type GatewayCode,
  gatewayCodes,
  PaymentsService,
  SETTLEMENT_BUFFER_MINUTES,
} from '../payments/index.js';
import { PromotionsService } from '../promotions/index.js';
import { ShippingService } from '../shipping/index.js';
import { CheckoutAddressService } from '../users/index.js';
import {
  REFUND_IN_FLIGHT_MS,
  REFUND_INTENT,
  refundedAmountOf,
  refundSummary,
} from './refund-ledger.js';

const HOLD_MINUTES = 15;
/** COD khong co han thanh toan: giu hang cho cua so van hanh, qua han nay worker tu huy. */
const COD_HOLD_DAYS = 3;
/**
 * Don da thu tien, ke ca da hoan mot phan, moi duoc hoan tiep. CANCELLED: khach tu huy don da tra
 * (ADR-038); refundPayment van doi payment SUCCEEDED nen don huy chua thu tien khong lot vao.
 */
export const REFUNDABLE: OrderStatus[] = [
  'CONFIRMED',
  'PAYMENT_REVIEW',
  'DELIVERED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
];

/**
 * Kiểm tra vận đơn đang giữ chỗ khởi tạo (`creating#...`) hoặc chờ đối soát (`create_uncertain...`)
 * hoặc chưa có mã vận đơn thật. Dùng để chặn hoàn tiền trực tiếp đua với luồng tạo vận đơn GHN.
 */
export function isShipmentCreatingOrReconciling(
  shipment:
    | {
        isMock?: boolean;
        trackingNumber?: string | null;
        carrierStatus?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!shipment) return false;
  if (!shipment.trackingNumber) return true;
  const cs = shipment.carrierStatus ?? '';
  return (
    cs.startsWith('creating') || cs.startsWith('create_uncertain') || cs.startsWith('uncertain_ghn')
  );
}
const CUSTOMER_CANCEL_REASON = 'Khách hủy đơn trước khi shop xử lý.';

/** Lenh hoan qua cong da chot thanh cong; phan he goi (returns) nghe de dong viec cua minh. */
export interface RefundSettled {
  intentId: string;
  paymentId: string;
  orderId: string;
  receipt: string;
}
export type RefundSettledListener = (
  event: RefundSettled,
  tx: Prisma.TransactionClient,
) => Promise<void>;
/**
 * Chay duoi khoa don truoc khi trang don hoan tien (qua cong hoac hoan tay). Nem loi thi khong hoan;
 * phan he tra hang dung de buoc hoan qua yeu cau tra con mo, tranh don het tien ma yeu cau van ket.
 */
export type OrderRefundGuard = (orderId: string, tx: Prisma.TransactionClient) => Promise<void>;
/** Trang thai mot lenh hoan theo so cong; MISSING: lenh chua tung duoc ghi. */
export type RefundIntentState = 'MISSING' | 'RECEIVED' | 'PROCESSED' | 'FAILED';
/** Lenh hoan da ghi RECEIVED duoi khoa don (claimRefund), cho gui ra cong (sendRefund). */
export interface RefundClaim {
  orderId: string;
  userId: string;
  gateway: string;
  intentId: string;
  payload: { amount: string; actor: string; reason: string | null; full: boolean };
  reference: string;
  checkoutUrl: string;
  transactionNo?: string;
}

/** Khach chon toi da mot uu dai cho mot don (UC-07.2). */
export interface DiscountInput {
  voucherCode?: string;
  promotionId?: string;
}
export interface AppliedDiscount {
  kind: 'VOUCHER' | 'PROMOTION';
  id: string;
  code?: string;
  name: string;
  amount: string;
}
const discountInvalid = (message: string) =>
  new UnprocessableEntityException({ error: 'DISCOUNT_INVALID', message });

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
  private readonly refundListeners: RefundSettledListener[] = [];
  private readonly refundGuards: OrderRefundGuard[] = [];
  constructor(
    private readonly prisma: PrismaService,
    readonly cart: CartService,
    readonly inventory: InventoryService,
    readonly orders: OrdersService,
    readonly payments: PaymentsService,
    private readonly addresses: CheckoutAddressService,
    private readonly shipping: ShippingService,
    private readonly config: ConfigService<Env, true>,
    readonly promotions: PromotionsService,
  ) {}

  /**
   * Tinh lai uu dai tren server tu ma/id khach gui, khong tin so tien web gui (UC-07.2).
   * Loi nghiep vu cua module promotions (400/404) doi thanh 422 DISCOUNT_INVALID de web hien ly do.
   */
  async discount(
    userId: string,
    subtotal: string,
    items: { variantId: string; price: string; quantity: number }[],
    input: DiscountInput,
  ): Promise<AppliedDiscount | null> {
    if (input.voucherCode && input.promotionId)
      throw discountInvalid('Mỗi đơn chỉ áp dụng một ưu đãi.');
    try {
      if (input.voucherCode) {
        const voucher = await this.promotions.validateVoucher(input.voucherCode, subtotal, userId);
        return {
          kind: 'VOUCHER',
          id: voucher.voucherId,
          code: voucher.code,
          name: `Mã ${voucher.code}`,
          amount: new Decimal(voucher.discountAmount).toFixed(2),
        };
      }
      if (input.promotionId) {
        const result = await this.promotions.evaluateCart(
          {
            subtotal,
            items: items.map(({ variantId, price, quantity }) => ({
              variantId,
              price: new Decimal(price).toFixed(2),
              quantity,
            })),
          },
          userId,
        );
        const promotion = result.applicablePromotions.find(
          (item) => item.promotionId === input.promotionId,
        );
        if (!promotion)
          throw discountInvalid('Chương trình khuyến mãi không còn áp dụng cho giỏ này.');
        return {
          kind: 'PROMOTION',
          id: promotion.promotionId,
          name: promotion.name,
          amount: new Decimal(promotion.discountAmount).toFixed(2),
        };
      }
      return null;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException)
        throw discountInvalid(error.message);
      throw error;
    }
  }

  /**
   * Chong bom COD (ADR-038): don vuot tran hoac khach da co du so lan giao COD that bai thi chi
   * nhan tra truoc. Tra ve ly do de checkout hien cho khach; null la duoc dung COD.
   */
  async codBlock(userId: string, total: string, db: Prisma.TransactionClient) {
    const max = this.config.get('COD_MAX_AMOUNT', { infer: true });
    if (new Decimal(total).gt(max))
      return `Đơn trên ${new Intl.NumberFormat('vi-VN').format(max)}đ cần thanh toán trước.`;
    const limit = this.config.get('COD_MAX_FAILED_DELIVERIES', { infer: true });
    const failed = await db.payment.count({
      where: { gateway: 'COD', status: 'FAILED', order: { userId } },
    });
    if (failed >= limit)
      return `Tài khoản có ${failed} đơn COD giao không thành công, vui lòng thanh toán trước.`;
    // ADR-040: don COD cho xac nhan khong chan don moi nhu don tra truoc, nhung co tran.
    const maxPending = this.config.get('COD_MAX_PENDING_ORDERS', { infer: true });
    const pending = await db.order.count({ where: { userId, status: 'PENDING_CONFIRMATION' } });
    return pending >= maxPending
      ? `Bạn đang có ${pending} đơn COD chờ shop xác nhận. Chờ shop xác nhận hoặc thanh toán trước cho đơn mới.`
      : null;
  }

  async quote(
    userId: string,
    addressId: string,
    tx: Prisma.TransactionClient,
    discountInput: DiscountInput = {},
  ) {
    const items = (await this.cart.checkoutSelection(userId, tx)).sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );
    if (!items.length || items.some((item) => !item.canCheckout))
      // Ma rieng de web phan biet voi 422 khac cua preview (vd. dia chi chua co bieu phi), Issue #66.
      throw new UnprocessableEntityException({
        error: 'SELECTION_REQUIRED',
        message: 'Chọn sản phẩm đủ tồn kho trong giỏ trước khi thanh toán.',
      });
    const address = await this.addresses.get(userId, addressId, tx);
    const subtotalAmount = items
      .reduce((sum, item) => sum.plus(new Decimal(item.price).times(item.quantity)), new Decimal(0))
      .toFixed(2);
    const appliedDiscount = await this.discount(userId, subtotalAmount, items, discountInput);
    const discountAmount = appliedDiscount?.amount ?? '0.00';
    // Mien phi ship tinh theo tien hang SAU giam (docs/features/shipping/README.md).
    const afterDiscount = new Decimal(subtotalAmount).minus(discountAmount).toFixed(2);
    const shipping = await this.shipping.quote(address.administrativeAreaId, afterDiscount, tx);
    const totalAmount = new Decimal(afterDiscount).plus(shipping.fee).toFixed(2);
    const codBlocked = await this.codBlock(userId, totalAmount, tx);
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
          // Doi ma/uu dai hoac so tien giam la doi fingerprint: create tra QUOTE_CHANGED.
          discount: appliedDiscount
            ? { kind: appliedDiscount.kind, id: appliedDiscount.id, amount: discountAmount }
            : '0.00', // giu nhu cu khi khong co uu dai: don dang cho khong doi fingerprint
        }),
      )
      .digest('hex');
    return {
      fingerprint,
      address,
      items,
      subtotalAmount,
      discountAmount,
      appliedDiscount,
      shippingFeeAmount: shipping.fee,
      shippingRateId: shipping.rateId,
      totalAmount,
      paymentConfigured: this.payments.gateways.list().some((gateway) => gateway.configured),
      gateways: this.payments.gateways
        .list()
        .map((gateway) =>
          gateway.code === 'COD' && codBlocked
            ? { ...gateway, configured: false, unavailableReason: codBlocked }
            : gateway,
        ),
      holdMinutes: HOLD_MINUTES,
      payMinutes: HOLD_MINUTES - SETTLEMENT_BUFFER_MINUTES,
    };
  }

  preview(userId: string, input: { addressId: string } & DiscountInput) {
    return this.prisma.$transaction(async (tx) => {
      const pending = await this.orders.pending(userId, tx);
      try {
        const quote = await this.quote(userId, input.addressId, tx, input);
        return {
          ...quote,
          pendingOrder: pending ? { id: pending.id, orderCode: pending.orderCode } : null,
        };
      } catch (error) {
        // Don cho dang giu don vi cuoi nen gio thay het hang: chi ra don do, khong bao khach chon lai gio.
        if (!(error instanceof UnprocessableEntityException)) throw error;
        // Loi uu dai khong lien quan don cho: tra nguyen ly do, khong doi thanh PENDING_ORDER_EXISTS.
        if ((error.getResponse() as { error?: string }).error === 'DISCOUNT_INVALID') throw error;
        if (pending)
          throw new ConflictException({
            error: 'PENDING_ORDER_EXISTS',
            message: `Bạn còn đơn ${pending.orderCode} đang chờ thanh toán và đang giữ hàng trong giỏ. Tiếp tục hoặc hủy đơn đó trước khi đặt đơn mới.`,
          });
        const [cod] = await this.orders.pendingCod(userId, tx);
        if (cod)
          throw new ConflictException({
            error: 'PENDING_ORDER_EXISTS',
            message: `Đơn COD ${cod.orderCode} đang chờ shop xác nhận và giữ hàng trong giỏ. Bỏ chọn món đó trong giỏ để đặt đơn mới, hoặc hủy đơn COD.`,
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
    } & DiscountInput,
    ip: string,
  ) {
    const code = input.gateway ?? 'VNPAY';
    const postCommitHooks: PostCommitHook[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        attachPostCommitHooks(tx, postCommitHooks);
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
        // Gui lai cung gio voi key moi: tra don dang cho thay vi tao don trung.
        const pending = await this.orders.pending(user.id, tx);
        const same = [pending, ...(await this.orders.pendingCod(user.id, tx))].find(
          (order) => order?.checkoutFingerprint === input.fingerprint,
        );
        if (same) {
          if (same.payments[0]?.gateway !== code)
            throw new ConflictException(
              'Đơn chờ đang dùng cổng khác. Tiếp tục đơn đó hoặc hủy trước khi đổi cổng.',
            );
          return this.view(same);
        }
        // Mot don tra truoc moi khach: don thu hai co the bi tra tien cung luc va mua trung. Don
        // COD cho xac nhan khong chan o day; tran so don COD nam trong codBlock (ADR-040).
        if (pending)
          throw new ConflictException({
            error: 'PENDING_ORDER_EXISTS',
            message:
              'Bạn còn một đơn đang chờ thanh toán. Tiếp tục hoặc hủy đơn đó trước khi đặt đơn mới.',
          });
        const quote = await this.quote(user.id, input.addressId, tx, input);
        if (quote.fingerprint !== input.fingerprint)
          throw new ConflictException({
            error: 'QUOTE_CHANGED',
            message: 'Giá, giỏ hàng hoặc địa chỉ đã đổi. Kiểm tra và xác nhận lại.',
          });
        const cod = code === 'COD';
        const codGateway = quote.gateways.find((gateway) => gateway.code === 'COD');
        if (cod && codGateway && 'unavailableReason' in codGateway)
          throw new ConflictException({
            error: 'COD_UNAVAILABLE',
            message: codGateway.unavailableReason,
          });
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
            discount: quote.discountAmount,
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
        // Ghi luot voucher cung transaction tao don: khoa dong voucher (FOR UPDATE) va dem lai luot.
        // Het luot giua preview va create thi rollback ca don; 409 de web tai lai preview va hien ly do.
        if (quote.appliedDiscount?.kind === 'VOUCHER') {
          try {
            await this.promotions.recordVoucherUsage(
              {
                voucherId: quote.appliedDiscount.id,
                orderId: order.id,
                userId: user.id,
                discountAmount: quote.discountAmount,
              },
              tx,
            );
          } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException)
              throw new ConflictException({ error: 'DISCOUNT_INVALID', message: error.message });
            throw error;
          }
        }
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
    await runPostCommitHooks(postCommitHooks);
    return this.view(await this.orders.get(result.id, user.id));
  }

  /**
   * Thanh toan online da thu tien, chua hoan dong nao, cong hoan duoc tu dong: khach tu huy don
   * CONFIRMED (shop chua bat dau xu ly) va nhan hoan tu dong (ADR-038).
   */
  selfRefundablePayment(order: OrderDetails) {
    if (order.status !== 'CONFIRMED') return null;
    // Khi đơn đang giữ chỗ khởi tạo hoặc chờ đối soát vận đơn (`order.shipment` đã tồn tại),
    // tạm khóa tự hủy/hoàn tiền để tránh đua với yêu cầu tạo vận đơn GHN đang chạy.
    if (order.shipment) return null;
    const payment = order.payments.find((row) => row.status === 'SUCCEEDED');
    if (!payment?.gateway || !this.autoRefund(payment.gateway)) return null;
    const ledger = refundSummary(payment.transactions);
    return ledger.refunded.isZero() && !ledger.pending ? payment : null;
  }

  /**
   * Hoan duoc qua API cong luc nay khong (ADR-111): COD va cong bi tat trong REFUND_GATEWAYS thi
   * khong, phan he goi chuyen sang hoan tay bang ma chuyen khoan.
   */
  autoRefund(gateway: string | null): boolean {
    return (
      !!gateway &&
      (gatewayCodes as readonly string[]).includes(gateway) &&
      this.payments.gateways.autoRefund(gateway as GatewayCode)
    );
  }

  view(order: OrderDetails) {
    const ledgers = order.payments.map((payment) => refundSummary(payment.transactions));
    const selfRefund = !!this.selfRefundablePayment(order);
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
      refundedAmount: ledgers
        .reduce((sum, ledger) => sum.plus(ledger.refunded), new Decimal(0))
        .toFixed(2),
      refundPending: ledgers.some((ledger) => !!ledger.pending),
      canCancel:
        order.status === 'PENDING_PAYMENT' || order.status === 'PENDING_CONFIRMATION' || selfRefund,
      cancelRefunds: selfRefund,
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            carrierName: order.shipment.carrierName,
            trackingNumber: order.shipment.trackingNumber,
            status: order.shipment.status,
            isMock: order.shipment.isMock,
            carrierStatus: order.shipment.carrierStatus ?? null,
            statusNote: order.shipment.statusNote ?? null,
            expectedDeliveryAt: order.shipment.expectedDeliveryAt?.toISOString() ?? null,
            createdAt: order.shipment.createdAt.toISOString(),
            updatedAt: order.shipment.updatedAt.toISOString(),
          }
        : null,
    };
  }

  async withOrder<T>(
    id: string,
    userId: string,
    work: (order: OrderDetails, tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const postCommitHooks: PostCommitHook[] = [];
    const result = await this.prisma.$transaction(
      async (tx) => {
        attachPostCommitHooks(tx, postCommitHooks);
        await this.cart.lockForCheckout(userId, tx);
        await this.orders.lock(id, tx);
        return work(await this.orders.get(id, userId, tx), tx);
      },
      { timeout: 15_000 },
    );
    await runPostCommitHooks(postCommitHooks);
    return result;
  }

  stockItems(order: OrderDetails) {
    return order.items.map((item) => ({
      variantId: item.productVariantId,
      quantity: item.quantity,
    }));
  }

  /**
   * Huy don online da tra ma shop chua xu ly (ADR-038), dung chung cho khach va ADMIN: duoi khoa
   * don tra hang ve kho va chuyen CANCELLED, roi goi hoan toan bo ngoai transaction. Cong khong
   * xac nhan thi don van huy, lenh hoan nam o tab "Can xu ly" cho ADMIN doi soat.
   */
  async cancelAndRefund(id: string, ownerId: string, actor: string, reason: string) {
    const paymentId = await this.withOrder(id, ownerId, async (order, tx) => {
      if (order.shipment)
        throw new ConflictException(
          'Đơn hàng đang trong quá trình khởi tạo hoặc đối soát vận đơn, tạm thời chưa thể hủy. Vui lòng kiểm tra lại sau ít phút.',
        );
      const paid = this.selfRefundablePayment(order);
      if (!paid)
        throw new ConflictException(
          'Đơn không hủy và hoàn tự động được: shop đã xử lý, đơn đã hoàn hoặc cổng chưa hỗ trợ hoàn tự động. Liên hệ shop kèm mã đơn.',
        );
      await this.inventory.restock(id, this.stockItems(order), tx);
      await this.promotions.releaseVoucherUsage(id, tx);
      await this.orders.transition(id, 'CANCELLED', tx, actor, {
        cancelSource: actor === ownerId ? 'CUSTOMER' : 'ADMIN',
        reason,
      });
      return paid.id;
    });
    try {
      await this.refundPayment(paymentId, actor, { reason });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Order ${id} cancelled, refund not confirmed: ${message}`);
    }
  }

  /** Huy don cua khach. Don cho tra/cho xac nhan COD: nha hang giu; don da tra: cancelAndRefund. */
  async cancel(id: string, userId: string, expired = false) {
    if (!expired && (await this.orders.get(id, userId)).status === 'CONFIRMED') {
      await this.cancelAndRefund(id, userId, userId, CUSTOMER_CANCEL_REASON);
      return this.view(await this.orders.get(id, userId));
    }
    await this.withOrder(id, userId, async (order, tx) => {
      const cancellable =
        order.status === 'PENDING_PAYMENT' || order.status === 'PENDING_CONFIRMATION';
      if (!cancellable) {
        if (!expired && order.status !== 'CANCELLED')
          throw new ConflictException(
            'Shop đã xử lý đơn, không thể hủy tại đây. Liên hệ shop kèm mã đơn.',
          );
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
      await this.promotions.releaseVoucherUsage(id, tx);
      await this.orders.transition(id, 'CANCELLED', tx, expired ? undefined : userId, {
        cancelSource: expired ? 'EXPIRED' : 'CUSTOMER',
      });
    });
    return this.view(await this.orders.get(id, userId));
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
    input: { amount?: string; reason?: string; intentId?: string },
  ) {
    const { order, userId } = await this.refundTarget(paymentId);
    const claim = await this.withOrder(order.id, userId, async (_current, tx) => {
      for (const guard of this.refundGuards) await guard(order.id, tx);
      return this.claimRefund(paymentId, actor, input, tx);
    });
    await this.sendRefund(claim);
    return this.view(await this.orders.get(order.id, userId));
  }

  /**
   * Buoc 1 cua refundPayment, goi TRONG withOrder cua caller: kiem cong, don, so con lai roi ghi lenh
   * RECEIVED. Phan he goi (returns) ghi dong `refunds` cua minh CUNG transaction nay, nen khong co
   * khoang ho giua "da nhan viec hoan" va "so cong da co lenh": thao tac hoan khac vao sau khoa don
   * luon thay lenh dang cho va bi 409. Sau khi transaction commit moi goi sendRefund.
   */
  async claimRefund(
    paymentId: string,
    actor: string,
    input: { amount?: string; reason?: string; intentId?: string },
    tx: Prisma.TransactionClient,
  ): Promise<RefundClaim> {
    if (input.intentId !== undefined && !input.intentId.startsWith(REFUND_INTENT))
      throw new Error(`intentId phai bat dau bang ${REFUND_INTENT}`);
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ConflictException('Không tìm thấy thanh toán.');
    const adapter = this.payments.gateways.get(payment.gateway as GatewayCode);
    if (!adapter.refund || !this.autoRefund(adapter.code))
      throw new ConflictException(
        `Cổng ${adapter.code} không hoàn tự động trên môi trường này. Chuyển khoản cho khách rồi nhập mã giao dịch để ghi hoàn tay.`,
      );
    if (payment.status !== 'SUCCEEDED')
      throw new ConflictException('Chỉ hoàn tiền cho thanh toán đã thành công.');
    const order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      include: { shipment: true },
    });
    if (!order.userId) throw new ConflictException('Đơn không có chủ sở hữu.');
    if (!REFUNDABLE.includes(order.status))
      throw new ConflictException('Đơn không ở trạng thái cho phép hoàn tiền.');
    if (
      isShipmentCreatingOrReconciling(order.shipment) ||
      (order.status === 'CONFIRMED' && order.shipment)
    )
      throw new ConflictException(
        'Đơn hàng đang trong quá trình khởi tạo hoặc đối soát vận đơn, không thể hoàn tiền lúc này.',
      );
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
    // Phan he goi (returns) tu dat ma lenh truoc de doi chieu lai khi cong khong tra loi.
    const intentId = input.intentId ?? `${REFUND_INTENT}${randomUUID()}`;
    await tx.paymentTransaction.create({
      data: {
        paymentId,
        gateway: payment.gateway!,
        externalTransactionId: intentId,
        status: 'RECEIVED',
        payload,
      },
    });
    return {
      orderId: order.id,
      userId: order.userId,
      gateway: payment.gateway!,
      intentId,
      payload,
      reference: payment.reference!,
      checkoutUrl: payment.checkoutUrl!,
      transactionNo,
    };
  }

  /**
   * Buoc 2 va 3 cua refundPayment: goi cong NGOAI transaction roi chot so. Chi goi SAU khi transaction
   * cua claimRefund da commit, neu khong loi giua chung se xoa mat dau vet lenh da gui.
   */
  async sendRefund(claim: RefundClaim) {
    const { gateway, intentId, payload } = claim;
    const adapter = this.payments.gateways.get(gateway as GatewayCode);
    let result: Awaited<ReturnType<NonNullable<typeof adapter.refund>>>;
    try {
      result = await adapter.refund!({
        reference: claim.reference,
        checkoutUrl: claim.checkoutUrl,
        amount: payload.amount,
        actor: payload.actor,
        full: payload.full,
        transactionNo: claim.transactionNo,
      });
    } catch (error) {
      // Timeout, phan hoi sai chu ky hay ma loi deu khong chung minh cong chua hoan: giu intent.
      const message = error instanceof Error ? error.message : 'Cổng không phản hồi.';
      await this.prisma.paymentTransaction.update({
        where: intentKey(gateway, intentId),
        data: { payload: { ...payload, lastError: message } },
      });
      throw new ServiceUnavailableException({
        error: 'REFUND_PENDING',
        message: `${message} Lệnh hoàn được giữ chờ đối soát; kiểm tra trên cổng rồi chốt kết quả trước khi hoàn tiếp.`,
      });
    }
    await this.settleRefund(claim.orderId, claim.userId, gateway, intentId, payload.actor, {
      receipt: `REFUND:${result.requestId}`,
      payload: result.payload,
    });
  }

  /**
   * Hoan tay don tra truoc (ADR-111): shop da chuyen khoan cho khach, ADMIN nhap ma giao dich. Ghi
   * REFUND:MANUAL:{ma} duoi khoa don nhu COD; con lenh qua cong dang cho thi 409, phai chot truoc.
   * Don CONFIRMED (hang chua roi kho) khong hoan tay o day, giong nut hoan qua cong.
   */
  async refundManually(
    paymentId: string,
    actor: string,
    input: { amount?: string; reason?: string; transferReference: string },
  ) {
    const { order, userId, adapter } = await this.refundTarget(paymentId);
    // COD hoan tay qua luong tra hang (co dong refunds va tai khoan khach), khong qua day.
    if (adapter.code === 'COD')
      throw new ConflictException('Đơn COD hoàn tiền qua yêu cầu trả hàng.');
    await this.withOrder(order.id, userId, async (current, tx) => {
      if (current.status === 'CONFIRMED')
        throw new ConflictException(
          'Đơn chưa rời kho: dùng Hủy và hoàn tiền thay vì hoàn tay từng phần.',
        );
      for (const guard of this.refundGuards) await guard(order.id, tx);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const ledger = await this.refundLedger(paymentId, tx);
      const remaining = payment.amount.minus(ledger.refunded);
      if (remaining.lte(0)) throw new ConflictException('Thanh toán đã được hoàn đủ.');
      await this.recordManualRefund(
        paymentId,
        actor,
        {
          amount: input.amount ?? remaining.toFixed(2),
          reference: input.transferReference,
          reason: input.reason ?? 'Hoàn tay bằng chuyển khoản',
        },
        tx,
      );
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
      .reduce((sum, row) => sum.plus(refundedAmountOf(row)), new Decimal(0));
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
        {
          refundedAmount: claim.amount,
          ...(claim.reason ? { reason: claim.reason } : {}),
        },
      );
      const event = {
        intentId,
        paymentId: payment.id,
        orderId: current.id,
        receipt: result.receipt,
      };
      for (const listener of this.refundListeners) await listener(event, tx);
    });
  }

  /**
   * Phan he khac dang ky viec chay CUNG transaction voi luc chot lenh hoan (ca phan hoi 00 lan chot tay
   * bang resolveRefund). Listener nem loi thi lenh hoan khong chot, nen listener phai bo qua lenh khong
   * thuoc minh.
   */
  onRefundSettled(listener: RefundSettledListener) {
    this.refundListeners.push(listener);
  }

  /**
   * Phan he khac chan hoan tien tu trang don (refundPayment, refundManually). Khong ap cho
   * claimRefund/recordManualRefund ma phan he goi truc tiep.
   */
  onOrderRefund(guard: OrderRefundGuard) {
    this.refundGuards.push(guard);
  }

  /**
   * Trang thai lenh hoan theo so cong, de phan he goi biet nen cho, hoan lai hay dong viec. Caller dang
   * giu khoa don thi truyen `tx` de doc cung transaction voi viec no sap ghi.
   */
  async refundIntentState(
    paymentId: string,
    intentId: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<RefundIntentState> {
    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.gateway) return 'MISSING';
    const intent = await db.paymentTransaction.findUnique({
      where: intentKey(payment.gateway, intentId),
    });
    if (!intent) return 'MISSING';
    return intent.status === 'RECEIVED' || intent.status === 'PROCESSED' ? intent.status : 'FAILED';
  }

  /**
   * Hoan tay (don COD: shop chuyen khoan cho khach roi nhap ma giao dich). Goi TRONG withOrder cua
   * caller: ghi REFUND:MANUAL:{ma} vao cung so voi hoan qua cong de so da hoan, bao cao va trang
   * thai don khop nhau. Mot ma giao dich chi ghi duoc mot lan tren TOAN so, du khac don hay khac
   * cong (UC-14.2/AC11): mot lan chuyen khoan khong chung minh duoc cho hai lan hoan.
   */
  async recordManualRefund(
    paymentId: string,
    actor: string,
    input: { amount: string; reference: string; reason: string },
    tx: Prisma.TransactionClient,
  ) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.status !== 'SUCCEEDED')
      throw new ConflictException('Chỉ hoàn tiền cho thanh toán đã thành công.');
    const order = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      include: { shipment: true },
    });
    if (!REFUNDABLE.includes(order.status))
      throw new ConflictException('Đơn không ở trạng thái cho phép hoàn tiền.');
    if (
      isShipmentCreatingOrReconciling(order.shipment) ||
      (order.status === 'CONFIRMED' && order.shipment)
    )
      throw new ConflictException(
        'Đơn hàng đang trong quá trình khởi tạo hoặc đối soát vận đơn, không thể hoàn tiền lúc này.',
      );
    const ledger = await this.refundLedger(paymentId, tx);
    if (ledger.pending) throw pendingRefund();
    const amount = new Decimal(input.amount);
    const remaining = payment.amount.minus(ledger.refunded);
    if (amount.lte(0) || amount.gt(remaining))
      throw new ConflictException(
        `Số hoàn tối đa là ${remaining.toFixed(2)}. Sử dụng số nhỏ hơn hoặc bằng.`,
      );
    const receipt = `REFUND:MANUAL:${input.reference}`;
    // Khoa theo ma, lay SAU khoa gio va khoa don nen khong tao vong cho. Hai don khac chu khong chung
    // khoa nao khac, va unique (gateway, externalTransactionId) khong bat duoc ma trung khac cong.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`refund-transfer:${input.reference}`}, 0))`;
    const duplicate = await tx.paymentTransaction.findFirst({
      where: { externalTransactionId: receipt },
    });
    if (duplicate)
      throw new ConflictException('Mã giao dịch này đã được ghi cho một lần hoàn khác.');
    await tx.paymentTransaction.create({
      data: {
        paymentId,
        gateway: payment.gateway!,
        externalTransactionId: receipt,
        status: 'PROCESSED',
        payload: {
          refundedAmount: amount.toFixed(2),
          reason: input.reason,
          actor,
          manual: true,
        },
      },
    });
    await this.orders.transition(
      order.id,
      ledger.refunded.plus(amount).gte(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      tx,
      actor,
    );
    return receipt;
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
