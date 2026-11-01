import { randomUUID } from 'node:crypto';

import { ConflictException, Injectable, Logger } from '@nestjs/common';

import type { PaymentStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { GatewayRegistry } from './gateway-registry.js';
import { type GatewayCode, gatewayCodes, type GatewayRequest } from './payment-gateway.js';

/** Link cong het han truoc hold de IPN/query tre van ve kip khi hang con giu. */
export const SETTLEMENT_BUFFER_MINUTES = 3;
const MIN_PAYMENT_WINDOW_MS = 60_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    readonly gateways: GatewayRegistry,
  ) {}

  byReference(reference: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).payment.findUnique({ where: { reference } });
  }

  latest(orderId: string, tx: Prisma.TransactionClient) {
    return tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  async create(
    orderId: string,
    requestKey: string,
    amount: string,
    holdUntil: Date,
    ip: string,
    tx: Prisma.TransactionClient,
    code: GatewayCode = 'VNPAY',
  ) {
    const previous = await tx.payment.findUnique({ where: { requestKey } });
    if (previous) {
      if (previous.orderId !== orderId)
        throw new ConflictException('Mã yêu cầu đã dùng cho đơn khác.');
      return previous;
    }
    // COD khong co han link thanh toan: tien thu khi giao, payment khong bao gio expire.
    const cod = code === 'COD';
    const expiresAt = cod
      ? null
      : new Date(holdUntil.getTime() - SETTLEMENT_BUFFER_MINUTES * 60_000);
    if (!cod && expiresAt!.getTime() - Date.now() < MIN_PAYMENT_WINDOW_MS)
      throw new ConflictException(
        'Không còn đủ thời gian thanh toán an toàn cho đơn này. Hủy đơn và đặt lại.',
      );
    const reference = `P${randomUUID().replaceAll('-', '')}`;
    const adapter = this.gateways.get(code);
    const input = { reference, amount, expiresAt: expiresAt ?? holdUntil, ip };
    const checkoutUrl = adapter.prepare(input);
    const payment = await tx.payment.create({
      data: {
        orderId,
        requestKey,
        reference,
        gateway: code,
        method: cod ? 'COD' : 'ONLINE',
        status: 'PENDING',
        amount,
        expiresAt,
        checkoutUrl,
      },
    });
    if (adapter.request)
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          gateway: code,
          externalTransactionId: `INIT:${reference}`,
          status: 'RECEIVED',
          payload: adapter.request(input),
        },
      });
    return payment;
  }

  async record(
    id: string,
    status: PaymentStatus,
    receipt: string,
    raw: Record<string, string>,
    tx: Prisma.TransactionClient,
  ) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
    const gateway = payment.gateway!;
    const existing = await tx.paymentTransaction.findUnique({
      where: {
        gateway_externalTransactionId: { gateway, externalTransactionId: receipt },
      },
    });
    if (existing) return false;
    await tx.paymentTransaction.create({
      data: {
        paymentId: id,
        gateway,
        externalTransactionId: receipt,
        status: 'PROCESSED',
        payload: raw,
      },
    });
    if (payment.status !== 'SUCCEEDED')
      await tx.payment.update({ where: { id }, data: { status } });
    return true;
  }

  expire(orderId: string, status: 'EXPIRED' | 'CANCELLED', tx: Prisma.TransactionClient) {
    return tx.payment.updateMany({
      where: { orderId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status },
    });
  }

  /** `skip`: payment worker da xu ly trong tick nay (vd chua claim duoc), tick sau thu lai. */
  candidates(skip: string[] = []) {
    return this.prisma.payment.findMany({
      where: {
        id: { notIn: skip },
        createdAt: { gte: new Date(Date.now() - 86400_000) },
        status: { not: 'SUCCEEDED' },
        OR: gatewayCodes.map((code) => {
          const before = new Date(Date.now() - this.gateways.get(code).queryIntervalMs);
          return {
            gateway: code,
            OR: [
              { lastCheckedAt: null, createdAt: { lte: before } },
              { lastCheckedAt: { lt: before } },
            ],
          };
        }),
      },
      take: 50,
      orderBy: [{ lastCheckedAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async claim(id: string, code: GatewayCode) {
    const before = new Date(Date.now() - this.gateways.get(code).queryIntervalMs);
    return (
      (
        await this.prisma.payment.updateMany({
          where: {
            id,
            gateway: code,
            OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: before } }],
          },
          data: { lastCheckedAt: new Date() },
        })
      ).count === 1
    );
  }

  /**
   * Query khong toi duoc cong (mat ket noi/timeout) thi khong tinh la mot lan query: lui claim de
   * worker thu lai sau `retryInMs` thay vi doi tron queryIntervalMs trong khi khach da tra tien.
   * Neu request thuc ra da toi cong, lan thu som nhat bi tu choi va tra null, claim giu nguyen.
   */
  async backoff(id: string, code: GatewayCode, retryInMs = 30_000) {
    const interval = this.gateways.get(code).queryIntervalMs;
    await this.prisma.payment.updateMany({
      where: { id, gateway: code },
      data: { lastCheckedAt: new Date(Date.now() - interval + Math.min(retryInMs, interval)) },
    });
  }

  /** Claim nhanh trong DB, sau do goi gateway NGOAI transaction don/kho. */
  async launchLatest(orderId: string, ip: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    if (
      !payment?.reference ||
      payment.checkoutUrl ||
      payment.status !== 'PENDING' ||
      !payment.expiresAt ||
      payment.expiresAt <= new Date() ||
      !gatewayCodes.includes(payment.gateway as GatewayCode)
    )
      return;
    const claimed = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: 'PENDING',
        checkoutUrl: null,
        OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 60_000) } }],
      },
      data: { lastCheckedAt: new Date() },
    });
    if (!claimed.count) return;
    try {
      const intent = await this.prisma.paymentTransaction.findUnique({
        where: {
          gateway_externalTransactionId: {
            gateway: payment.gateway!,
            externalTransactionId: `INIT:${payment.reference}`,
          },
        },
      });
      const payload = intent?.payload;
      const request =
        payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        Object.values(payload).every((value) =>
          ['string', 'number', 'boolean'].includes(typeof value),
        )
          ? (payload as GatewayRequest)
          : undefined;
      const checkoutUrl = await this.gateways.get(payment.gateway as GatewayCode).createRemote(
        {
          reference: payment.reference,
          amount: payment.amount.toFixed(2),
          expiresAt: payment.expiresAt,
          ip,
        },
        request,
      );
      await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: 'PENDING',
          checkoutUrl: null,
          expiresAt: { gt: new Date() },
        },
        data: { checkoutUrl },
      });
    } catch {
      // Timeout khong dong nghia giao dich that bai. Giu reference de retry/query cung attempt.
      this.logger.warn(
        `${payment.gateway} initialization pending; keep payment reference for recovery.`,
      );
    }
  }
}
