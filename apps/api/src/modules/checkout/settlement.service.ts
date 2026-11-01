import {
  BadRequestException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type GatewayCode, gatewayCodes, type PaymentEvent } from '../payments/index.js';
import { CheckoutService } from './checkout.service.js';

type Result = 'PROCESSED' | 'DUPLICATE' | 'UNKNOWN' | 'MISMATCH' | 'INVALID' | 'RETRY';
const vnpayReplies: Record<Result, { RspCode: string; Message: string }> = {
  PROCESSED: { RspCode: '00', Message: 'Processed' },
  DUPLICATE: { RspCode: '02', Message: 'Already processed' },
  UNKNOWN: { RspCode: '01', Message: 'Order not found' },
  MISMATCH: { RspCode: '04', Message: 'Invalid amount or merchant' },
  INVALID: { RspCode: '97', Message: 'Invalid checksum' },
  RETRY: { RspCode: '99', Message: 'Retry later' },
};

@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(SettlementService.name);
  constructor(
    private readonly checkout: CheckoutService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async ipn(raw: Record<string, unknown>) {
    return vnpayReplies[await this.receive('VNPAY', raw)];
  }
  async momoIpn(raw: Record<string, unknown>) {
    const result = await this.receive('MOMO', raw);
    if (result === 'RETRY')
      throw new ServiceUnavailableException('Chưa ghi nhận được kết quả, vui lòng gửi lại.');
    if (!['PROCESSED', 'DUPLICATE'].includes(result))
      throw new BadRequestException('Thông báo thanh toán không hợp lệ.');
  }
  private async receive(code: GatewayCode, raw: Record<string, unknown>): Promise<Result> {
    const event = this.checkout.payments.gateways.get(code).notification(raw);
    if (!event) return 'INVALID';
    try {
      return await this.settle(event);
    } catch {
      this.logger.error(code + ' settlement failed; callback may retry.');
      return 'RETRY';
    }
  }

  /** Chi nhan event da xac thuc boi adapter IPN/query, khong nhan browser return. */
  async settle(event: PaymentEvent): Promise<Result> {
    const { payments, orders, inventory, cart } = this.checkout;
    const payment = await payments.byReference(event.reference);
    if (!payment) return 'UNKNOWN';
    // IPN MoMo dung chung mot endpoint cho ca bien the vi va the: event den tu
    // adapter MOMO nen don MOMO_ATM phia duoc cong cung ho MoMo, khong MISMATCH.
    const momoFamily = (code: string): GatewayCode =>
      code === 'MOMO_ATM' ? 'MOMO' : (code as GatewayCode);
    if (
      momoFamily(payment.gateway!) !== momoFamily(event.gateway) ||
      !payments.gateways
        .get(momoFamily(event.gateway))
        .matches(event, payment.reference!, payment.amount.toFixed(2))
    )
      return 'MISMATCH';
    const initial = await orders.get(payment.orderId);
    if (!initial.userId) return 'UNKNOWN';
    return this.checkout.withOrder(initial.id, initial.userId, async (order, tx) => {
      const current = await payments.byReference(event.reference, tx);
      if (current!.status === 'SUCCEEDED') return 'DUPLICATE';
      if (event.state === 'PENDING') return 'PROCESSED';
      const success = event.state === 'SUCCEEDED';
      if (success && !/^[1-9]\d{0,19}$/u.test(event.receipt)) return 'RETRY';
      const recorded = await payments.record(payment.id, event.state, event.receipt, event.raw, tx);
      if (!recorded) return 'DUPLICATE';
      if (!success) return 'PROCESSED';
      const items = this.checkout.stockItems(order);
      const validHold =
        order.status === 'PENDING_PAYMENT' && order.paymentDueAt && order.paymentDueAt > new Date();
      if (validHold && (await inventory.commit(order.id, items, tx))) {
        await orders.transition(order.id, 'CONFIRMED', tx);
        await cart.consumePurchased(order.userId!, items, tx);
      } else {
        await inventory.release(order.id, items, tx);
        if (order.status !== 'PAYMENT_REVIEW')
          await orders.transition(order.id, 'PAYMENT_REVIEW', tx);
      }
      return 'PROCESSED';
    });
  }

  /**
   * Return URL co chu ky cua cong (VNPAY vnp_SecureHash, MoMo signature): ket qua cu the
   * duoc ghi ngay khong cho query interval. SUCCESS di qua settle nhu IPN; FAILED (khach
   * huy tren cong) dong payment attempt, don giu nguyen de thu lai hoac huy tay.
   */
  async returnNotice(reference: string, raw: Record<string, unknown>): Promise<boolean> {
    const payment = await this.checkout.payments.byReference(reference);
    if (!payment || payment.status === 'SUCCEEDED') return false;
    const family = (code: string): GatewayCode =>
      code === 'MOMO_ATM' ? 'MOMO' : (code as GatewayCode);
    const adapter = this.checkout.payments.gateways.get(family(payment.gateway!));
    const event = adapter.notification(raw);
    if (!event || event.reference !== reference) {
      this.logger.warn(
        `${payment.gateway} return notice dropped: ${event ? 'sai reference' : 'chu ky hoac du lieu khong hop le'}.`,
      );
      return false;
    }
    if (event.state === 'PENDING' || !adapter.matches(event, reference, payment.amount.toFixed(2)))
      return false;
    if (event.state === 'SUCCEEDED') {
      await this.settle(event);
      return true;
    }
    const order = await this.checkout.orders.get(payment.orderId);
    if (!order.userId) return false;
    await this.checkout.withOrder(order.id, order.userId, async (_order, tx) => {
      await this.checkout.payments.record(payment.id, 'FAILED', event.receipt, event.raw, tx);
    });
    return true;
  }

  async reconcile(reference: string) {
    const payments = this.checkout.payments;
    const payment = await payments.byReference(reference);
    if (
      !payment ||
      payment.status === 'SUCCEEDED' ||
      payment.gateway === 'COD' ||
      !gatewayCodes.includes(payment.gateway as GatewayCode)
    )
      return;
    const adapter = payments.gateways.get(payment.gateway as GatewayCode);
    if (
      !adapter.configured() ||
      (payment.gateway === 'VNPAY' && !payment.checkoutUrl) ||
      !(await payments.claim(payment.id, payment.gateway as GatewayCode))
    )
      return;
    try {
      const event = await adapter.query(reference, payment.checkoutUrl);
      if (event) await this.settle(event);
    } catch (error) {
      await payments.backoff(payment.id, payment.gateway as GatewayCode);
      this.logger.warn(
        `${payment.gateway} query unavailable (${error instanceof Error ? error.name : 'unknown'}); retry soon.`,
      );
    }
  }

  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const order of await this.checkout.orders.due()) {
        if (order.userId) await this.checkout.cancel(order.id, order.userId, true);
      }
      for (const payment of await this.checkout.payments.candidates()) {
        if (['MOMO', 'MOMO_ATM'].includes(payment.gateway ?? '') && !payment.checkoutUrl)
          await this.checkout.payments.launchLatest(payment.orderId, '127.0.0.1');
        if (payment.reference) await this.reconcile(payment.reference);
      }
    } catch {
      this.logger.error('Checkout recovery interrupted; next tick will retry.');
    } finally {
      this.busy = false;
    }
  }
}
