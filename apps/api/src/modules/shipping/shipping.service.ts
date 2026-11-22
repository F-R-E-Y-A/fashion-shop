import { randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InventoryService } from '../inventory/index.js';
import {
  NotificationsService,
  type OrderStatusNotificationContext,
} from '../notifications/index.js';
import {
  attachPostCommitHooks,
  OrdersService,
  type PostCommitHook,
  runPostCommitHooks,
} from '../orders/index.js';
import { PaymentsService } from '../payments/index.js';
import { PromotionsService } from '../promotions/index.js';
import {
  canTransitionShipment,
  type CarrierConfigResponse,
  type CreateShipmentDto,
  type ShipmentResponse,
  type ShipmentStatus,
  type ShipmentWebhookDto,
} from './dto/shipment.dto.js';
import { GhnCarrierGateway } from './ghn.carrier.js';
import { MockCarrierGateway } from './mock.carrier.js';
import type {
  CarrierMode,
  CarrierStatusEvent,
  CreateCarrierShipmentInput,
  CreateCarrierShipmentResult,
} from './shipping-carrier.js';

type ShipmentRow = {
  id: string;
  orderId: string;
  carrierName: string | null;
  trackingNumber: string | null;
  status: string;
  isMock?: boolean;
  carrierStatus?: string | null;
  statusNote?: string | null;
  expectedDeliveryAt?: Date | null;
  carrierUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ShipmentStatusMeta = {
  carrierStatus?: string;
  fromWebhook?: boolean;
  manualSimulation?: boolean;
  requireRealCarrier?: boolean;
  expectedTrackingNumber?: string;
  expectedClientOrderCode?: string;
  occurredAt?: string;
  expectedUpdatedAt?: Date;
};

const INTENT_CREATING_PREFIX = 'creating';
const INTENT_UNCERTAIN_PREFIX = 'create_uncertain';
const IN_FLIGHT_CREATING_TTL_MS = 45_000;

function isCreatingIntent(carrierStatus?: string | null): boolean {
  return Boolean(
    carrierStatus &&
    (carrierStatus === INTENT_CREATING_PREFIX ||
      carrierStatus.startsWith(`${INTENT_CREATING_PREFIX}:`) ||
      carrierStatus.startsWith(`${INTENT_CREATING_PREFIX}#`)),
  );
}

function isUncertainIntent(carrierStatus?: string | null): boolean {
  return Boolean(
    carrierStatus &&
    (carrierStatus === INTENT_UNCERTAIN_PREFIX ||
      carrierStatus.startsWith(`${INTENT_UNCERTAIN_PREFIX}:`)),
  );
}

function isCreateIntentStatus(carrierStatus?: string | null): boolean {
  return isCreatingIntent(carrierStatus) || isUncertainIntent(carrierStatus);
}

function encodeCreatingIntentStatus(
  attemptId: string,
  clientOrderCode: string,
  baseOrderCode: string,
): string {
  const head = `${INTENT_CREATING_PREFIX}#${attemptId}`;
  return clientOrderCode === baseOrderCode ? head : `${head}:${clientOrderCode}`;
}

function encodeUncertainIntentStatus(clientOrderCode: string, baseOrderCode: string): string {
  return clientOrderCode === baseOrderCode
    ? INTENT_UNCERTAIN_PREFIX
    : `${INTENT_UNCERTAIN_PREFIX}:${clientOrderCode}`;
}

function decodeIntentAttemptId(carrierStatus?: string | null): string | null {
  if (!isCreatingIntent(carrierStatus) || !carrierStatus) return null;
  const colonIdx = carrierStatus.indexOf(':');
  const head = colonIdx === -1 ? carrierStatus : carrierStatus.slice(0, colonIdx);
  const hashIdx = head.indexOf('#');
  if (hashIdx === -1) return null;
  const token = head.slice(hashIdx + 1).trim();
  return token || null;
}

function decodeIntentClientOrderCode(
  carrierStatus: string | null | undefined,
  baseOrderCode: string,
): string {
  if (!carrierStatus) return baseOrderCode;
  const idx = carrierStatus.indexOf(':');
  if (idx === -1) return baseOrderCode;
  const code = carrierStatus.slice(idx + 1).trim();
  return code || baseOrderCode;
}

function ownsCreatingIntent(
  shipment:
    | {
        trackingNumber?: string | null;
        isMock?: boolean;
        carrierStatus?: string | null;
      }
    | null
    | undefined,
  attemptId: string,
): boolean {
  return Boolean(
    shipment &&
    shipment.isMock === false &&
    !shipment.trackingNumber &&
    decodeIntentAttemptId(shipment.carrierStatus) === attemptId,
  );
}

function isActiveCreatingIntent(shipment: {
  trackingNumber?: string | null;
  isMock?: boolean;
  carrierStatus?: string | null;
  updatedAt?: Date;
}): boolean {
  if (shipment.isMock !== false || shipment.trackingNumber) return false;
  if (!isCreatingIntent(shipment.carrierStatus)) return false;
  if (!shipment.updatedAt) return true;
  return Date.now() - shipment.updatedAt.getTime() < IN_FLIGHT_CREATING_TTL_MS;
}

function isReconcilableIntent(shipment: {
  trackingNumber?: string | null;
  isMock?: boolean;
  carrierStatus?: string | null;
  updatedAt?: Date;
}): boolean {
  if (shipment.isMock !== false || shipment.trackingNumber) return false;
  if (isUncertainIntent(shipment.carrierStatus)) return true;
  if (isCreatingIntent(shipment.carrierStatus)) {
    return !isActiveCreatingIntent(shipment);
  }
  return false;
}

function isCancelledGhnBeforePickup(order: {
  status: string;
  shipment: { status: string; isMock?: boolean; carrierStatus?: string | null } | null;
}): boolean {
  return Boolean(
    order.shipment &&
    order.shipment.isMock === false &&
    order.shipment.status === 'FAILED' &&
    order.shipment.carrierStatus === 'cancel' &&
    order.status === 'PROCESSING',
  );
}

type LockedOrderWithShipment = {
  id: string;
  orderCode: string;
  userId: string | null;
  customerEmail: string;
  status: string;
  shipment: ShipmentRow | null;
  items?: Array<{ productVariantId: string; quantity: number }>;
  payments?: Array<{
    id: string;
    gateway: string | null;
    status: string;
    transactions?: Array<{
      externalTransactionId?: string | null;
      status?: string | null;
    }>;
  }>;
};

function hasOrderRefundActivity(order: {
  payments?: Array<{
    status?: string;
    transactions?: Array<{
      externalTransactionId?: string | null;
      status?: string | null;
    }>;
  }>;
}): 'PENDING_REFUND' | 'REFUNDED' | null {
  for (const payment of order.payments ?? []) {
    if (payment.status === 'REFUNDED') return 'REFUNDED';
    for (const txRow of payment.transactions ?? []) {
      const extId = txRow.externalTransactionId ?? '';
      if (extId.startsWith('REFUND-INTENT:') && txRow.status === 'RECEIVED') {
        return 'PENDING_REFUND';
      }
      if (extId.startsWith('REFUND:') && txRow.status === 'PROCESSED') {
        return 'REFUNDED';
      }
    }
  }
  return null;
}

function parseEventTime(raw?: string): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly orders?: OrdersService,
    @Optional() private readonly inventory?: InventoryService,
    @Optional() private readonly payments?: PaymentsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly ghn?: GhnCarrierGateway,
    @Optional() private readonly mockCarrier?: MockCarrierGateway,
    @Optional() private readonly promotions?: PromotionsService,
  ) {}

  getCarrierConfig(): CarrierConfigResponse {
    const ghnConfigured = Boolean(this.ghn?.configured());
    return {
      ghnConfigured,
      mode: ghnConfigured ? 'GHN_SANDBOX' : 'MOCK_ONLY',
    };
  }

  async quote(areaId: string, subtotal: string, tx?: Prisma.TransactionClient) {
    const row = await (tx ?? this.prisma).shippingRate.findFirst({
      where: {
        isActive: true,
        minWeightGrams: null,
        maxWeightGrams: null,
        shippingZone: {
          isActive: true,
          shippingZoneAreas: { some: { administrativeAreaId: areaId } },
        },
      },
      orderBy: { id: 'asc' },
    });
    if (!row) throw new UnprocessableEntityException('Địa chỉ này chưa có biểu phí giao hàng.');
    return {
      rateId: row.id,
      fee: new Decimal(subtotal).gte(500_000) ? '0.00' : row.fee.toFixed(2),
    };
  }

  async getShipment(orderId: string, tx?: Prisma.TransactionClient): Promise<ShipmentResponse> {
    const shipment = await (tx ?? this.prisma).shipment.findUnique({
      where: { orderId },
    });
    if (!shipment) {
      throw new NotFoundException('Không tìm thấy thông tin vận đơn của đơn hàng này.');
    }
    return this.toResponse(shipment);
  }

  async createShipment(
    orderId: string,
    dto: CreateShipmentDto,
    actorUserId?: string,
  ): Promise<ShipmentResponse> {
    const mode: CarrierMode = dto.mode ?? 'AUTO';
    const requestedCarrier = dto.carrierName?.trim() || 'GHN';
    const customTracking = dto.trackingNumber?.trim();
    const ghnReady = Boolean(this.ghn?.configured());

    if (mode === 'GHN' && !customTracking && !ghnReady) {
      throw new ServiceUnavailableException('Chưa cấu hình GHN Sandbox (GHN_TOKEN, GHN_SHOP_ID).');
    }

    const shouldCallGhn =
      !customTracking &&
      ghnReady &&
      (mode === 'GHN' || (mode === 'AUTO' && requestedCarrier.toUpperCase() === 'GHN'));

    let externalResult: CreateCarrierShipmentResult | null = null;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;
    let verificationFailed = false;
    let cleanupIntentAndThrow: unknown = null;
    let phase1ClientOrderCode: string | null = null;
    let phase1AttemptId: string | null = null;
    let phase1PreviousShipment: ShipmentRow | null = null;

    if (shouldCallGhn && this.ghn) {
      // Pha 1 (dưới khóa OrdersService.lock): ghi nhận bản ghi giữ chỗ intent `creating#<attemptId>[:clientCode]`
      // TRƯỚC khi gọi HTTP ra ngoài GHN. Giữ nguyên đơn ở CONFIRMED (bản ghi giữ chỗ chặn hủy tạm thời dưới khóa),
      // chỉ chuyển sang PROCESSING khi tạo vận đơn thành công để thất bại GHN không khóa mất quyền tự hủy của khách.
      const phase1 = await this.prisma.$transaction(async (tx) => {
        if (this.orders) await this.orders.lock(orderId, tx);

        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            shipment: true,
            items: true,
            payments: { include: { transactions: true } },
          },
        });
        if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
        this.assertOrderReadyForShipment(order, true);
        const phase1RefundActivity = await this.findOrderRefundActivity(tx, order);
        if (phase1RefundActivity) {
          throw new ConflictException(
            phase1RefundActivity === 'PENDING_REFUND'
              ? 'Đơn hàng đang có lệnh hoàn tiền chờ kết quả, không thể tạo vận đơn.'
              : 'Đơn hàng đã hoàn tiền, không thể tạo vận đơn.',
          );
        }

        const existingShipment = order.shipment as ShipmentRow | null;
        const retryingIntent = Boolean(existingShipment && isReconcilableIntent(existingShipment));
        const replacingCancelledGhn = isCancelledGhnBeforePickup(order);

        let clientOrderCode = order.orderCode;
        if (retryingIntent && existingShipment) {
          clientOrderCode = decodeIntentClientOrderCode(
            existingShipment.carrierStatus,
            order.orderCode,
          );
        } else if (replacingCancelledGhn) {
          clientOrderCode = `${order.orderCode}-R${randomUUID().slice(0, 4).toUpperCase()}`;
        }

        const previousSnapshot: ShipmentRow | null =
          existingShipment && !retryingIntent ? { ...existingShipment } : null;

        const attemptId = randomBytes(4).toString('hex');
        const intentStatus = encodeCreatingIntentStatus(
          attemptId,
          clientOrderCode,
          order.orderCode,
        );
        await tx.shipment.upsert({
          where: { orderId },
          create: {
            orderId,
            carrierName: requestedCarrier,
            trackingNumber: null,
            status: 'PENDING',
            isMock: false,
            carrierStatus: intentStatus,
            statusNote: 'Đang khởi tạo vận đơn trên GHN Sandbox...',
            expectedDeliveryAt: null,
          },
          update: {
            carrierName: requestedCarrier,
            trackingNumber: null,
            status: 'PENDING',
            isMock: false,
            carrierStatus: intentStatus,
            statusNote: 'Đang khởi tạo vận đơn trên GHN Sandbox...',
            expectedDeliveryAt: null,
            carrierUpdatedAt: null,
          },
        });

        return {
          attemptId,
          clientOrderCode,
          reconcileFirst: retryingIntent,
          previousSnapshot,
          carrierInput: this.buildCarrierInput(
            order,
            requestedCarrier,
            customTracking,
            clientOrderCode,
          ),
        };
      });

      phase1AttemptId = phase1.attemptId;
      phase1ClientOrderCode = phase1.clientOrderCode;
      phase1PreviousShipment = phase1.previousSnapshot;

      const tryLookupByClientCode = async (): Promise<
        | { outcome: 'found'; result: CreateCarrierShipmentResult }
        | { outcome: 'not_found' }
        | { outcome: 'failed' }
      > => {
        if (typeof this.ghn?.queryOrderByClientCode !== 'function') {
          return { outcome: 'not_found' };
        }
        try {
          const found = await this.ghn.queryOrderByClientCode(phase1.clientOrderCode);
          return found ? { outcome: 'found', result: found } : { outcome: 'not_found' };
        } catch (lookupErr) {
          this.logger.warn(
            `Không tra cứu xác minh được client_order_code=${phase1.clientOrderCode} trên GHN: ${lookupErr instanceof Error ? lookupErr.message : String(lookupErr)}`,
          );
          return { outcome: 'failed' };
        }
      };

      if (phase1.reconcileFirst) {
        const preLookup = await tryLookupByClientCode();
        if (preLookup.outcome === 'found') {
          this.logger.log(
            `Đối soát lại thành công vận đơn GHN thật ${preLookup.result.trackingNumber} theo client_order_code=${phase1.clientOrderCode}.`,
          );
          externalResult = preLookup.result;
        } else if (preLookup.outcome === 'failed') {
          verificationFailed = true;
        }
      }

      if (!externalResult && !verificationFailed) {
        try {
          externalResult = await this.ghn.createOrder(phase1.carrierInput);
        } catch (err) {
          const postLookup = await tryLookupByClientCode();
          if (postLookup.outcome === 'found') {
            this.logger.log(
              `Khôi phục được vận đơn GHN thật ${postLookup.result.trackingNumber} cho đơn ${phase1.clientOrderCode} theo client_order_code sau lỗi tạo đơn.`,
            );
            externalResult = postLookup.result;
          } else if (postLookup.outcome === 'failed') {
            verificationFailed = true;
          } else if (mode === 'GHN') {
            cleanupIntentAndThrow = err;
          } else {
            fallbackReason = err instanceof Error ? err.message : String(err);
            fallbackUsed = true;
            this.logger.warn(
              `GHN Sandbox tạo vận đơn lỗi cho đơn ${phase1.clientOrderCode}, đã xác nhận chưa có đơn trên GHN, chuyển sang dự phòng mô phỏng: ${fallbackReason}`,
            );
            externalResult = await this.getMockGateway().createOrder(phase1.carrierInput);
          }
        }
      }

      // Pha 2 (nhánh chưa xác minh được kết quả GHN): chỉ chuyển sang `create_uncertain[:clientCode]` nếu đúng lượt sở hữu attemptId.
      if (verificationFailed) {
        const uncertainResult = await this.prisma.$transaction(async (tx) => {
          if (this.orders) await this.orders.lock(orderId, tx);
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { shipment: true },
          });
          if (!order) return null;
          // Nếu webhook hoặc lượt tiếp quản đã kịp điền trackingNumber thật thì trả về vận đơn thật
          if (order.shipment && order.shipment.isMock === false && order.shipment.trackingNumber) {
            return this.toResponse(order.shipment);
          }
          // Lượt cũ mất quyền giữ chỗ (lượt khác đã tiếp quản hoặc đã dọn) -> tuyệt đối không ghi đè
          if (!ownsCreatingIntent(order.shipment, phase1.attemptId)) {
            return null;
          }
          const uncertainStatus = encodeUncertainIntentStatus(
            phase1.clientOrderCode,
            order.orderCode,
          );
          await tx.shipment.upsert({
            where: { orderId },
            create: {
              orderId,
              carrierName: requestedCarrier,
              trackingNumber: null,
              status: 'PENDING',
              isMock: false,
              carrierStatus: uncertainStatus,
              statusNote:
                'Chưa xác minh được kết quả tạo vận đơn trên GHN Sandbox. Bấm "Đối soát / tạo lại vận đơn GHN" để kiểm tra lại theo mã đơn.',
              expectedDeliveryAt: null,
            },
            update: {
              carrierName: requestedCarrier,
              trackingNumber: null,
              status: 'PENDING',
              isMock: false,
              carrierStatus: uncertainStatus,
              statusNote:
                'Chưa xác minh được kết quả tạo vận đơn trên GHN Sandbox. Bấm "Đối soát / tạo lại vận đơn GHN" để kiểm tra lại theo mã đơn.',
              expectedDeliveryAt: null,
            },
          });
          return null;
        });
        if (uncertainResult) return uncertainResult;
        throw new ServiceUnavailableException(
          'Không xác minh được kết quả tạo vận đơn trên GHN Sandbox (có thể đã tạo đơn trước khi mất kết nối/timeout). Vui lòng thử lại để hệ thống đối soát theo mã đơn hàng, tránh tạo vận đơn mô phỏng lệch nhau.',
        );
      }

      // Pha 2 (nhánh mode='GHN' bị từ chối và GHN đã xác nhận không có đơn): chỉ dọn/khôi phục khi vẫn sở hữu đúng attemptId.
      if (cleanupIntentAndThrow) {
        await this.prisma.$transaction(async (tx) => {
          if (this.orders) await this.orders.lock(orderId, tx);
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: { shipment: true },
          });
          if (!order || !ownsCreatingIntent(order.shipment, phase1.attemptId)) {
            return;
          }
          const fallbackCancelledSnapshot =
            !phase1PreviousShipment && phase1.clientOrderCode !== order.orderCode
              ? {
                  carrierName: requestedCarrier,
                  trackingNumber: null,
                  status: 'FAILED',
                  isMock: false,
                  carrierStatus: 'cancel',
                  statusNote:
                    'Vận đơn GHN trước đó đã bị hủy và lượt tạo vận đơn thay thế vừa thất bại; có thể tạo lại vận đơn thay thế hoặc chốt hủy đơn COD.',
                  expectedDeliveryAt: null,
                  carrierUpdatedAt: null,
                }
              : null;
          const snapshotToRestore = phase1PreviousShipment ?? fallbackCancelledSnapshot;
          if (snapshotToRestore) {
            await tx.shipment.upsert({
              where: { orderId },
              create: {
                orderId,
                carrierName: snapshotToRestore.carrierName,
                trackingNumber: snapshotToRestore.trackingNumber,
                status: snapshotToRestore.status as ShipmentStatus,
                isMock: snapshotToRestore.isMock ?? false,
                carrierStatus: snapshotToRestore.carrierStatus ?? null,
                statusNote: snapshotToRestore.statusNote ?? null,
                expectedDeliveryAt: snapshotToRestore.expectedDeliveryAt ?? null,
                carrierUpdatedAt: snapshotToRestore.carrierUpdatedAt ?? null,
              },
              update: {
                carrierName: snapshotToRestore.carrierName,
                trackingNumber: snapshotToRestore.trackingNumber,
                status: snapshotToRestore.status as ShipmentStatus,
                isMock: snapshotToRestore.isMock ?? false,
                carrierStatus: snapshotToRestore.carrierStatus ?? null,
                statusNote: snapshotToRestore.statusNote ?? null,
                expectedDeliveryAt: snapshotToRestore.expectedDeliveryAt ?? null,
                carrierUpdatedAt: snapshotToRestore.carrierUpdatedAt ?? null,
              },
            });
          } else if (typeof tx.shipment.deleteMany === 'function') {
            await tx.shipment.deleteMany({ where: { orderId } });
          } else if (typeof tx.shipment.delete === 'function') {
            await tx.shipment.delete({ where: { orderId } });
          }
        });
        throw cleanupIntentAndThrow;
      }
    }

    const postCommitHooks: PostCommitHook[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      attachPostCommitHooks(tx, postCommitHooks);
      if (this.orders) await this.orders.lock(orderId, tx);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          shipment: true,
          items: true,
          payments: { include: { transactions: true } },
        },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      const refundActivity = await this.findOrderRefundActivity(tx, order);

      if (phase1ClientOrderCode && phase1AttemptId) {
        // Pha 2 hoàn tất intent GHN (hoặc fallback mock sau khi đã xác nhận không có đơn trên GHN)
        if (
          ['CANCELLED', 'DELIVERED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW'].includes(
            order.status,
          ) ||
          refundActivity !== null
        ) {
          if (externalResult?.isMock === false) {
            this.logger.error(
              `Lượt tạo GHN ${phase1AttemptId} hoàn tất với mã ${externalResult.trackingNumber} nhưng đơn ${order.orderCode} đã ở trạng thái ${order.status} (refund=${refundActivity ?? 'none'}).`,
            );
          }
          throw new ConflictException(
            refundActivity === 'PENDING_REFUND'
              ? 'Đơn hàng đang có lệnh hoàn tiền chờ kết quả, không thể lưu vận đơn.'
              : `Đơn hàng đã chuyển sang trạng thái ${order.status}, không thể lưu vận đơn.`,
          );
        }
        if (
          order.shipment &&
          order.shipment.isMock === false &&
          order.shipment.trackingNumber &&
          externalResult
        ) {
          if (
            externalResult.isMock === false &&
            order.shipment.trackingNumber === externalResult.trackingNumber
          ) {
            const incomingAt = parseEventTime(externalResult.occurredAt);
            const storedAt = order.shipment.carrierUpdatedAt ?? null;
            const targetStatus: ShipmentStatus = externalResult.status ?? 'PENDING';
            const currentStatus = order.shipment.status as ShipmentStatus;
            const hasNewerTimestamp =
              incomingAt !== null && (!storedAt || incomingAt.getTime() > storedAt.getTime());
            const isRegressingToReadyToPick =
              externalResult.carrierStatus === 'ready_to_pick' &&
              Boolean(order.shipment.carrierStatus) &&
              order.shipment.carrierStatus !== 'ready_to_pick';
            const canAdvance =
              currentStatus === targetStatus || canTransitionShipment(currentStatus, targetStatus);
            if (!hasNewerTimestamp || isRegressingToReadyToPick || !canAdvance) {
              return this.toResponse(order.shipment);
            }
            return this.applyShipmentStatusInTx(
              tx,
              order,
              targetStatus,
              actorUserId,
              externalResult.statusNote,
              {
                carrierStatus: externalResult.carrierStatus,
                fromWebhook: false,
                requireRealCarrier: true,
                expectedTrackingNumber: externalResult.trackingNumber,
                occurredAt: externalResult.occurredAt,
              },
              postCommitHooks,
            );
          }
          throw new ConflictException(
            `Đơn hàng đã có vận đơn GHN thật (${order.shipment.trackingNumber}), không thể ghi đè.`,
          );
        }
        if (!ownsCreatingIntent(order.shipment, phase1AttemptId)) {
          if (externalResult?.isMock === false) {
            this.logger.warn(
              `Lượt tạo GHN ${phase1AttemptId} (mã ${externalResult.trackingNumber}) đã mất quyền giữ chỗ cho đơn ${order.orderCode}; bỏ qua ghi DB để tránh đè lượt mới.`,
            );
          }
          throw new ConflictException(
            'Yêu cầu tạo vận đơn này đã hết phiên hoặc đã được lượt xử lý khác tiếp quản. Vui lòng kiểm tra lại trạng thái vận đơn.',
          );
        }
      } else {
        this.assertOrderReadyForShipment(order, false);
        if (refundActivity) {
          throw new ConflictException(
            refundActivity === 'PENDING_REFUND'
              ? 'Đơn hàng đang có lệnh hoàn tiền chờ kết quả, không thể tạo vận đơn.'
              : 'Đơn hàng đã hoàn tiền, không thể tạo vận đơn.',
          );
        }
      }

      const carrierResult =
        externalResult ??
        (await this.getMockGateway().createOrder({
          orderId,
          orderCode: order.orderCode,
          carrierName: requestedCarrier,
          customTrackingNumber: customTracking,
          recipientName: '',
          phone: '',
          detailAddress: '',
          commune: '',
          province: '',
          codAmount: 0,
          insuranceValue: 0,
          items: [],
        }));

      const expectedDeliveryDate = carrierResult.expectedDeliveryAt
        ? new Date(carrierResult.expectedDeliveryAt)
        : null;
      const recoveredStatus: ShipmentStatus = carrierResult.status ?? 'PENDING';
      const recoveredAt = parseEventTime(carrierResult.occurredAt);
      const fallbackMeta = fallbackUsed ? { fallbackUsed: true, fallbackReason } : undefined;

      if (recoveredStatus === 'PENDING') {
        const shipment = await tx.shipment.upsert({
          where: { orderId },
          create: {
            orderId,
            carrierName: carrierResult.carrierName,
            trackingNumber: carrierResult.trackingNumber,
            status: 'PENDING',
            isMock: carrierResult.isMock,
            carrierStatus: carrierResult.carrierStatus,
            statusNote: carrierResult.statusNote,
            expectedDeliveryAt: expectedDeliveryDate,
            ...(recoveredAt ? { carrierUpdatedAt: recoveredAt } : {}),
          },
          update: {
            carrierName: carrierResult.carrierName,
            trackingNumber: carrierResult.trackingNumber,
            status: 'PENDING',
            isMock: carrierResult.isMock,
            carrierStatus: carrierResult.carrierStatus,
            statusNote: carrierResult.statusNote,
            expectedDeliveryAt: expectedDeliveryDate,
            carrierUpdatedAt: recoveredAt,
          },
        });

        // Nếu đơn đang CONFIRMED, tự chuyển sang PROCESSING (chuẩn bị giao) và kèm thông tin vận đơn
        if (order.status === 'CONFIRMED' && this.orders) {
          await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId, {
            carrierName: carrierResult.carrierName,
            trackingNumber: carrierResult.trackingNumber,
            isMockShipment: carrierResult.isMock,
            expectedDeliveryAt: carrierResult.expectedDeliveryAt,
          });
        } else if (order.status === 'PROCESSING' && this.notifications) {
          postCommitHooks.push(() =>
            this.notifications!.notifyShipmentCreated(
              {
                id: order.id,
                orderCode: order.orderCode,
                customerEmail: order.customerEmail,
                userId: order.userId,
              },
              {
                carrierName: carrierResult.carrierName,
                trackingNumber: carrierResult.trackingNumber,
                isMock: carrierResult.isMock,
                expectedDeliveryAt: carrierResult.expectedDeliveryAt,
              },
            ),
          );
        }

        return this.toResponse(shipment, fallbackMeta);
      }

      // Vận đơn khôi phục từ GHN đã tiến qua trạng thái khác PENDING (IN_TRANSIT/DELIVERED/FAILED/RETURNED):
      // lưu bản ghi gốc PENDING rồi chạy qua cùng nhánh chuyển trạng thái trong 1 transaction để đồng bộ đơn/COD/kho.
      const baseShipment = await tx.shipment.upsert({
        where: { orderId },
        create: {
          orderId,
          carrierName: carrierResult.carrierName,
          trackingNumber: carrierResult.trackingNumber,
          status: 'PENDING',
          isMock: carrierResult.isMock,
          carrierStatus: 'ready_to_pick',
          statusNote: 'Đã khôi phục vận đơn thật từ GHN Sandbox theo mã đơn hàng.',
          expectedDeliveryAt: expectedDeliveryDate,
        },
        update: {
          carrierName: carrierResult.carrierName,
          trackingNumber: carrierResult.trackingNumber,
          status: 'PENDING',
          isMock: carrierResult.isMock,
          carrierStatus: 'ready_to_pick',
          statusNote: 'Đã khôi phục vận đơn thật từ GHN Sandbox theo mã đơn hàng.',
          expectedDeliveryAt: expectedDeliveryDate,
          carrierUpdatedAt: null,
        },
      });

      let effectiveOrderStatus = order.status;
      if (
        order.status === 'CONFIRMED' &&
        (recoveredStatus === 'FAILED' || recoveredStatus === 'RETURNED') &&
        this.orders
      ) {
        await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId, {
          carrierName: carrierResult.carrierName,
          trackingNumber: carrierResult.trackingNumber,
          isMockShipment: carrierResult.isMock,
          expectedDeliveryAt: carrierResult.expectedDeliveryAt,
        });
        effectiveOrderStatus = 'PROCESSING';
      }

      const applied = await this.applyShipmentStatusInTx(
        tx,
        {
          ...order,
          status: effectiveOrderStatus,
          shipment: baseShipment,
        },
        recoveredStatus,
        actorUserId,
        carrierResult.statusNote,
        {
          carrierStatus: carrierResult.carrierStatus,
          fromWebhook: false,
          requireRealCarrier: !carrierResult.isMock,
          expectedTrackingNumber: carrierResult.trackingNumber,
          occurredAt: carrierResult.occurredAt,
        },
        postCommitHooks,
      );
      return fallbackMeta ? { ...applied, ...fallbackMeta } : applied;
    });

    await runPostCommitHooks(postCommitHooks);
    return result;
  }

  async syncShipmentFromCarrier(orderId: string, actorUserId?: string): Promise<ShipmentResponse> {
    const shipment = await this.prisma.shipment.findUnique({ where: { orderId } });
    if (!shipment) {
      throw new NotFoundException('Không tìm thấy thông tin vận đơn của đơn hàng này.');
    }
    if (shipment.isMock !== false) {
      throw new ConflictException(
        'Vận đơn này đang ở chế độ mô phỏng nội bộ, không thể đồng bộ từ GHN.',
      );
    }
    if (!shipment.trackingNumber) {
      throw new ConflictException('Vận đơn chưa có mã tra cứu GHN.');
    }
    if (!this.ghn?.configured()) {
      throw new ServiceUnavailableException('Chưa cấu hình GHN Sandbox (GHN_TOKEN, GHN_SHOP_ID).');
    }

    const event = await this.ghn.queryOrder(shipment.trackingNumber);
    if (!event) {
      return this.toResponse(shipment);
    }
    return this.updateShipmentStatus(orderId, event.status, actorUserId, event.note, {
      carrierStatus: event.carrierStatus,
      fromWebhook: false,
      requireRealCarrier: true,
      expectedTrackingNumber: shipment.trackingNumber,
      occurredAt: event.occurredAt,
      expectedUpdatedAt: shipment.updatedAt,
    });
  }

  async updateShipmentStatus(
    orderId: string,
    status: ShipmentStatus,
    actorUserId?: string,
    note?: string,
    meta?: ShipmentStatusMeta,
  ): Promise<ShipmentResponse> {
    const postCommitHooks: PostCommitHook[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      attachPostCommitHooks(tx, postCommitHooks);
      // Khoá đơn trước khi đọc trạng thái, cùng khoá với các thao tác admin (OrdersService.lock):
      // webhook gửi lại đồng thời với admin bấm "Đã giao" không cùng vượt qua bước kiểm trạng thái.
      if (this.orders) await this.orders.lock(orderId, tx);
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true, items: true, payments: true },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      return this.applyShipmentStatusInTx(
        tx,
        order,
        status,
        actorUserId,
        note,
        meta,
        postCommitHooks,
      );
    });
    await runPostCommitHooks(postCommitHooks);
    return result;
  }

  private async applyShipmentStatusInTx(
    tx: Prisma.TransactionClient,
    order: LockedOrderWithShipment,
    status: ShipmentStatus,
    actorUserId: string | undefined,
    note: string | undefined,
    meta: ShipmentStatusMeta | undefined,
    postCommitHooks: PostCommitHook[],
  ): Promise<ShipmentResponse> {
    const orderId = order.id;
    const shipment = order.shipment;
    if (!shipment) throw new NotFoundException('Chưa tạo vận đơn cho đơn hàng này.');

    if (meta?.manualSimulation && shipment.isMock === false) {
      throw new ConflictException(
        'Vận đơn GHN thật chỉ được cập nhật qua đồng bộ GHN hoặc webhook, không thể dùng thao tác mô phỏng.',
      );
    }

    if (meta?.requireRealCarrier && shipment.isMock !== false) {
      throw new ConflictException(
        'Bỏ qua webhook GHN vì vận đơn hiện tại đang ở chế độ mô phỏng nội bộ.',
      );
    }

    if (
      meta?.expectedTrackingNumber &&
      shipment.trackingNumber &&
      shipment.trackingNumber !== meta.expectedTrackingNumber
    ) {
      throw new ConflictException(
        `Bỏ qua sự kiện vì mã vận đơn ${meta.expectedTrackingNumber} không khớp vận đơn hiện tại (${shipment.trackingNumber}).`,
      );
    }

    if (
      shipment.isMock === false &&
      !shipment.trackingNumber &&
      isCreateIntentStatus(shipment.carrierStatus)
    ) {
      if (!meta?.fromWebhook) {
        throw new ConflictException(
          'Vận đơn đang trong quá trình khởi tạo hoặc đối soát trên GHN.',
        );
      }
      const expectedIntentCode = decodeIntentClientOrderCode(
        shipment.carrierStatus,
        order.orderCode,
      );
      const clientCodeMismatch =
        Boolean(meta.expectedClientOrderCode) &&
        meta.expectedClientOrderCode !== expectedIntentCode;
      if (isActiveCreatingIntent(shipment)) {
        if (clientCodeMismatch) {
          throw new ConflictException('Bỏ qua webhook GHN vì không khớp mã đơn đang khởi tạo.');
        }
        // Trả 503 để GHN kích hoạt cơ chế retry (tối đa 10 lần, mỗi lần cách 5 giây) sau khi lượt tạo/đối soát hoàn tất.
        throw new ServiceUnavailableException(
          'Vận đơn đang được khởi tạo hoặc đối soát trên GHN, vui lòng gửi lại webhook sau ít giây.',
        );
      }
      if (!meta.expectedTrackingNumber || !meta.expectedClientOrderCode || clientCodeMismatch) {
        throw new ConflictException('Bỏ qua webhook GHN vì không khớp mã đơn đang chờ đối soát.');
      }
    }

    if (order.status === 'CANCELLED' && status !== 'FAILED' && status !== 'RETURNED') {
      throw new ConflictException('Đơn hàng đã bị hủy, không thể cập nhật vận chuyển.');
    }

    const currentStatus = shipment.status as ShipmentStatus;
    const incomingEventAt = parseEventTime(meta?.occurredAt);
    const storedCarrierAt = shipment.carrierUpdatedAt ?? null;
    const isRedeliveryFromFailed =
      currentStatus === 'FAILED' && (status === 'IN_TRANSIT' || status === 'DELIVERED');

    if (meta?.requireRealCarrier) {
      // Nếu bản ghi đã đổi trong lúc syncShipmentFromCarrier đang gọi GHN ngoài lock, luôn từ chối 409 để tránh ghi đè mù.
      if (
        meta.expectedUpdatedAt &&
        shipment.updatedAt.getTime() > meta.expectedUpdatedAt.getTime()
      ) {
        throw new ConflictException(
          'Vận đơn vừa được cập nhật trong lúc đồng bộ từ GHN, vui lòng đồng bộ lại.',
        );
      }
      if (incomingEventAt && storedCarrierAt) {
        if (incomingEventAt.getTime() < storedCarrierAt.getTime()) {
          throw new ConflictException('Bỏ qua sự kiện GHN cũ hơn trạng thái đã ghi nhận gần nhất.');
        }
        if (isRedeliveryFromFailed && incomingEventAt.getTime() === storedCarrierAt.getTime()) {
          throw new ConflictException(
            'Bỏ qua sự kiện GHN không mới hơn mốc giao thất bại đã ghi nhận.',
          );
        }
      } else if (isRedeliveryFromFailed && storedCarrierAt && !incomingEventAt) {
        throw new ConflictException(
          'Không thể chuyển từ trạng thái giao thất bại sang đang giao/đã giao khi sự kiện GHN thiếu mốc thời gian đối chiếu.',
        );
      }
      if (
        meta.carrierStatus === 'ready_to_pick' &&
        shipment.carrierStatus &&
        shipment.carrierStatus !== 'ready_to_pick' &&
        !isCreateIntentStatus(shipment.carrierStatus)
      ) {
        throw new ConflictException('Bỏ qua sự kiện GHN lùi về trạng thái ready_to_pick.');
      }
    }

    const shouldFillTracking = Boolean(
      meta?.fromWebhook &&
      meta?.expectedTrackingNumber &&
      !shipment.trackingNumber &&
      isCreateIntentStatus(shipment.carrierStatus),
    );
    const nextCarrierUpdatedAt =
      incomingEventAt && (!storedCarrierAt || incomingEventAt.getTime() > storedCarrierAt.getTime())
        ? incomingEventAt
        : undefined;

    // Xử lý sự kiện trùng trạng thái nội bộ (ví dụ ready_to_pick -> picking trong PENDING,
    // hoặc picked -> delivering trong IN_TRANSIT)
    if (currentStatus === status) {
      const subChanged =
        shouldFillTracking ||
        nextCarrierUpdatedAt !== undefined ||
        (meta?.carrierStatus !== undefined && meta.carrierStatus !== shipment.carrierStatus) ||
        (note !== undefined && note !== shipment.statusNote);
      if (subChanged) {
        const refreshed = await tx.shipment.update({
          where: { orderId },
          data: {
            ...(shouldFillTracking ? { trackingNumber: meta!.expectedTrackingNumber } : {}),
            ...(meta?.carrierStatus !== undefined ? { carrierStatus: meta.carrierStatus } : {}),
            ...(note !== undefined ? { statusNote: note } : {}),
            ...(nextCarrierUpdatedAt ? { carrierUpdatedAt: nextCarrierUpdatedAt } : {}),
          },
        });
        if (shouldFillTracking && order.status === 'CONFIRMED' && this.orders) {
          await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId, {
            carrierName: refreshed.carrierName,
            trackingNumber: refreshed.trackingNumber,
            isMockShipment: refreshed.isMock ?? false,
            expectedDeliveryAt: refreshed.expectedDeliveryAt?.toISOString() ?? null,
          });
        } else if (shouldFillTracking && order.status === 'PROCESSING' && this.notifications) {
          postCommitHooks.push(() =>
            this.notifications!.notifyShipmentCreated(
              {
                id: order.id,
                orderCode: order.orderCode,
                customerEmail: order.customerEmail,
                userId: order.userId,
              },
              {
                carrierName: refreshed.carrierName,
                trackingNumber: refreshed.trackingNumber,
                isMock: refreshed.isMock ?? false,
                expectedDeliveryAt: refreshed.expectedDeliveryAt?.toISOString() ?? null,
              },
            ),
          );
        }
        return this.toResponse(refreshed);
      }
      return this.toResponse(shipment);
    }

    // Kiểm tra ma trận chuyển trạng thái: chặn lùi trạng thái (trừ luồng giao lại từ FAILED)
    if (!canTransitionShipment(currentStatus, status)) {
      throw new ConflictException(
        `Không thể chuyển trạng thái vận đơn từ ${currentStatus} sang ${status}.`,
      );
    }

    const updateData: Prisma.ShipmentUpdateInput = { status };
    if (shouldFillTracking) updateData.trackingNumber = meta!.expectedTrackingNumber;
    if (meta?.carrierStatus !== undefined) updateData.carrierStatus = meta.carrierStatus;
    if (note !== undefined) updateData.statusNote = note;
    if (nextCarrierUpdatedAt) updateData.carrierUpdatedAt = nextCarrierUpdatedAt;

    const updatedShipment = await tx.shipment.update({
      where: { orderId },
      data: updateData,
    });

    const sharedContext: OrderStatusNotificationContext = {
      carrierName: updatedShipment.carrierName,
      trackingNumber: updatedShipment.trackingNumber,
      isMockShipment: updatedShipment.isMock ?? true,
      expectedDeliveryAt: updatedShipment.expectedDeliveryAt?.toISOString() ?? null,
      ...(note !== undefined ? { note } : {}),
      ...(meta?.fromWebhook !== undefined ? { fromCarrierWebhook: meta.fromWebhook } : {}),
    };
    const hasRichContext = note !== undefined || meta?.fromWebhook !== undefined;
    const orderItems = order.items ?? [];
    const orderPayments = order.payments ?? [];

    // Đồng bộ trạng thái đơn hàng theo luồng vận chuyển
    if (status === 'IN_TRANSIT') {
      if (order.status === 'CONFIRMED' && this.orders) {
        await this.orders.transition(
          orderId,
          'PROCESSING',
          tx,
          actorUserId,
          hasRichContext ? sharedContext : undefined,
        );
      }
      if ((order.status === 'PROCESSING' || order.status === 'CONFIRMED') && this.orders) {
        await this.orders.transition(
          orderId,
          'SHIPPED',
          tx,
          actorUserId,
          hasRichContext ? sharedContext : undefined,
        );
      }
    } else if (status === 'DELIVERED') {
      if (order.status === 'CONFIRMED' && this.orders) {
        await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId);
        await this.orders.transition(orderId, 'SHIPPED', tx, actorUserId);
      } else if (order.status === 'PROCESSING' && this.orders) {
        await this.orders.transition(orderId, 'SHIPPED', tx, actorUserId);
      }
      if (order.status !== 'DELIVERED' && this.orders) {
        const cod = orderPayments.find((p) => p.gateway === 'COD' && p.status === 'PENDING');
        if (cod && this.payments) {
          await this.payments.record(
            cod.id,
            'SUCCEEDED',
            `COD:${order.orderCode}:${randomUUID().slice(0, 8)}`,
            { note: note ?? 'Shipper giao hàng thành công', actor: actorUserId ?? 'CARRIER' },
            tx,
          );
        }
        await this.orders.transition(
          orderId,
          'DELIVERED',
          tx,
          actorUserId,
          hasRichContext ? sharedContext : undefined,
        );
      }
    } else if (status === 'FAILED') {
      if (order.status === 'CONFIRMED' && this.orders) {
        await this.orders.transition(
          orderId,
          'PROCESSING',
          tx,
          actorUserId,
          hasRichContext ? sharedContext : undefined,
        );
      }
      if (this.notifications) {
        postCommitHooks.push(() =>
          this.notifications!.notifyShipmentFailed({
            id: order.id,
            orderCode: order.orderCode,
            customerEmail: order.customerEmail,
            userId: order.userId,
            carrierName: updatedShipment.carrierName,
            trackingNumber: updatedShipment.trackingNumber,
            note,
          }),
        );
      }
    } else if (status === 'RETURNED') {
      let effectiveOrderStatus = order.status;
      if (effectiveOrderStatus === 'CONFIRMED' && this.orders) {
        await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId);
        effectiveOrderStatus = 'PROCESSING';
      }
      const cod = orderPayments.find((p) => p.gateway === 'COD' && p.status === 'PENDING');
      if (cod && ['PROCESSING', 'SHIPPED'].includes(effectiveOrderStatus)) {
        if (this.payments) {
          await this.payments.record(
            cod.id,
            'FAILED',
            `COD-FAILED:${order.orderCode}`,
            { note: note ?? 'Hàng hoàn về kho', actor: actorUserId ?? 'CARRIER' },
            tx,
          );
        }
        if (this.inventory) {
          const stockItems = orderItems.map((i) => ({
            variantId: i.productVariantId,
            quantity: i.quantity,
          }));
          await this.inventory.restock(orderId, stockItems, tx);
        }
        // Don huy thi tra luot voucher, cung transaction (UC-07.2), nhu deliveryFailed.
        await this.promotions?.releaseVoucherUsage(orderId, tx);
        if (this.orders) {
          await this.orders.transition(orderId, 'CANCELLED', tx, actorUserId, {
            ...sharedContext,
            cancelSource: 'DELIVERY_FAILED',
            reason: note ?? 'Giao hàng không thành công, hàng đã hoàn về kho',
          });
        }
      } else if (this.notifications) {
        postCommitHooks.push(() =>
          this.notifications!.notifyShipmentFailed({
            id: order.id,
            orderCode: order.orderCode,
            customerEmail: order.customerEmail,
            userId: order.userId,
            carrierName: updatedShipment.carrierName,
            trackingNumber: updatedShipment.trackingNumber,
            note: note ?? 'Hàng hoàn về kho — bộ phận CSKH sẽ liên hệ xử lý hoàn tiền.',
          }),
        );
      }
    }

    return this.toResponse(updatedShipment);
  }

  async handleWebhook(payload: ShipmentWebhookDto) {
    return this.applyWebhookEvent(payload);
  }

  async handleGhnWebhook(rawPayload: Record<string, unknown>) {
    const parser = this.ghn ?? new GhnCarrierGateway();
    const parsed: CarrierStatusEvent | null = parser.parseWebhook(rawPayload);
    if (!parsed) {
      return {
        received: true,
        processed: false,
        ignored: true,
        reason: 'Unsupported or ignored GHN webhook payload',
      };
    }
    return this.applyWebhookEvent({
      trackingNumber: parsed.trackingNumber,
      clientOrderCode: parsed.clientOrderCode,
      status: parsed.status,
      carrierStatus: parsed.carrierStatus,
      note: parsed.note,
      occurredAt: parsed.occurredAt,
      requireRealCarrier: true,
    });
  }

  private async applyWebhookEvent(payload: {
    orderId?: string;
    trackingNumber?: string;
    clientOrderCode?: string;
    status: ShipmentStatus;
    carrierStatus?: string;
    note?: string;
    occurredAt?: string;
    requireRealCarrier?: boolean;
  }) {
    let shipment = null;
    if (payload.orderId) {
      shipment = await this.prisma.shipment.findUnique({
        where: { orderId: payload.orderId },
      });
    } else if (payload.trackingNumber) {
      shipment = await this.prisma.shipment.findFirst({
        where: { trackingNumber: payload.trackingNumber },
      });
    }
    if (!shipment && payload.clientOrderCode) {
      const baseOrderCode = payload.clientOrderCode.replace(/-R[0-9A-Fa-f]{4}$/u, '');
      shipment = await this.prisma.shipment.findFirst({
        where: {
          order: {
            orderCode:
              baseOrderCode !== payload.clientOrderCode
                ? { in: [payload.clientOrderCode, baseOrderCode] }
                : payload.clientOrderCode,
          },
        },
      });
    }

    if (!shipment) {
      return { received: true, processed: false, message: 'Shipment not found' };
    }

    try {
      // Truyền actorUserId = undefined để DB ghi NULL hợp lệ cho cột UUID order_status_history.actor_user_id.
      // Kiểm tra isMock và đối chiếu trackingNumber diễn ra trong cùng khóa giao dịch của updateShipmentStatus.
      const updated = await this.updateShipmentStatus(
        shipment.orderId,
        payload.status,
        undefined,
        payload.note,
        {
          carrierStatus: payload.carrierStatus,
          fromWebhook: true,
          requireRealCarrier: payload.requireRealCarrier,
          expectedTrackingNumber: payload.trackingNumber,
          expectedClientOrderCode: payload.clientOrderCode,
          occurredAt: payload.occurredAt,
        },
      );

      return {
        received: true,
        processed: true,
        orderId: shipment.orderId,
        status: updated.status,
        carrierStatus: updated.carrierStatus ?? null,
      };
    } catch (err) {
      // Trả về 200 kèm ignored: true khi sự kiện đến muộn hoặc lùi trạng thái để tránh retry vô hạn.
      if (err instanceof ConflictException) {
        return {
          received: true,
          processed: false,
          orderId: shipment.orderId,
          status: shipment.status,
          ignored: true,
          reason: err.message,
        };
      }
      throw err;
    }
  }

  private getMockGateway(): MockCarrierGateway {
    return this.mockCarrier ?? new MockCarrierGateway();
  }

  private async findOrderRefundActivity(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      payments?: Array<{
        id?: string;
        status?: string;
        transactions?: Array<{
          externalTransactionId?: string | null;
          status?: string | null;
        }>;
      }>;
    },
  ): Promise<'PENDING_REFUND' | 'REFUNDED' | null> {
    const fromIncluded = hasOrderRefundActivity(order);
    if (fromIncluded) return fromIncluded;

    const hasTransactionsArray = (order.payments ?? []).some((p) => Array.isArray(p.transactions));
    if (!hasTransactionsArray && typeof tx.paymentTransaction?.findFirst === 'function') {
      const row = await tx.paymentTransaction.findFirst({
        where: {
          payment: { orderId: order.id },
          OR: [
            { externalTransactionId: { startsWith: 'REFUND-INTENT:' }, status: 'RECEIVED' },
            { externalTransactionId: { startsWith: 'REFUND:' }, status: 'PROCESSED' },
          ],
        },
        select: { externalTransactionId: true, status: true },
      });
      if (row) {
        return row.externalTransactionId.startsWith('REFUND-INTENT:')
          ? 'PENDING_REFUND'
          : 'REFUNDED';
      }
    }
    return null;
  }

  private assertOrderReadyForShipment(
    order: {
      status: string;
      payments?: Array<{
        status?: string;
        transactions?: Array<{
          externalTransactionId?: string | null;
          status?: string | null;
        }>;
      }>;
      shipment: {
        status: string;
        isMock?: boolean;
        trackingNumber?: string | null;
        carrierStatus?: string | null;
        updatedAt?: Date;
      } | null;
    },
    allowGhnIntentReconcile = false,
  ) {
    if (
      ['CANCELLED', 'DELIVERED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW'].includes(
        order.status,
      )
    ) {
      throw new ConflictException(`Đơn hàng ở trạng thái ${order.status}, không thể tạo vận đơn.`);
    }
    if (['PENDING_PAYMENT', 'PENDING_CONFIRMATION'].includes(order.status)) {
      throw new ConflictException(
        'Đơn hàng chưa sẵn sàng để tạo vận đơn. Vui lòng xác nhận hoặc thanh toán trước.',
      );
    }
    const refundActivity = hasOrderRefundActivity(order);
    if (refundActivity) {
      throw new ConflictException(
        refundActivity === 'PENDING_REFUND'
          ? 'Đơn hàng đang có lệnh hoàn tiền chờ kết quả, không thể tạo vận đơn.'
          : 'Đơn hàng đã hoàn tiền, không thể tạo vận đơn.',
      );
    }
    if (!order.shipment) return;
    // GHN chỉ cho hủy vận đơn (`cancel`) trước lúc lấy hàng (đơn vẫn ở PROCESSING, hàng còn tại kho):
    // cho phép admin tạo vận đơn thay thế (GHN với hậu tố -Rxxxx hoặc mô phỏng).
    if (isCancelledGhnBeforePickup(order)) return;
    if (order.shipment.isMock === false) {
      if (isActiveCreatingIntent(order.shipment)) {
        throw new ConflictException(
          'Đang có yêu cầu tạo vận đơn GHN cho đơn hàng này, vui lòng chờ hoàn tất rồi kiểm tra lại.',
        );
      }
      if (isReconcilableIntent(order.shipment)) {
        if (allowGhnIntentReconcile) return;
        throw new ConflictException(
          'Đơn hàng đang chờ đối soát kết quả tạo vận đơn GHN thật, không thể tạo vận đơn mô phỏng. Vui lòng đối soát lại với GHN.',
        );
      }
      throw new ConflictException(
        `Đơn hàng đã có vận đơn GHN thật (${order.shipment.trackingNumber ?? 'chưa rõ mã'}), không thể tạo mới hoặc ghi đè bằng vận đơn khác.`,
      );
    }
    if (order.shipment.status !== 'PENDING') {
      throw new ConflictException(
        `Vận đơn đang ở trạng thái ${order.shipment.status}, không thể tạo mới hoặc ghi đè mã vận đơn.`,
      );
    }
  }

  private buildCarrierInput(
    order: {
      id: string;
      orderCode: string;
      shippingAddressSnapshot: unknown;
      subtotalAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      items: Array<{
        productVariantId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        productSnapshot: unknown;
      }>;
      payments: Array<{ gateway: string | null; status: string }>;
    },
    carrierName: string,
    customTrackingNumber?: string,
    clientOrderCode?: string,
  ): CreateCarrierShipmentInput {
    const addr = (order.shippingAddressSnapshot ?? {}) as Record<string, unknown>;
    const hasPendingCod = order.payments.some((p) => p.gateway === 'COD' && p.status === 'PENDING');
    const codAmount = hasPendingCod ? Math.max(0, Math.round(Number(order.totalAmount))) : 0;

    return {
      orderId: order.id,
      orderCode: clientOrderCode ?? order.orderCode,
      carrierName,
      customTrackingNumber,
      recipientName: typeof addr.recipientName === 'string' ? addr.recipientName : 'Khách hàng',
      phone: typeof addr.phone === 'string' ? addr.phone : '',
      detailAddress: typeof addr.detailAddress === 'string' ? addr.detailAddress : '',
      commune: typeof addr.commune === 'string' ? addr.commune : '',
      province: typeof addr.province === 'string' ? addr.province : '',
      codAmount,
      insuranceValue: Math.max(0, Math.round(Number(order.subtotalAmount))),
      items: order.items.map((item) => {
        const snap = (item.productSnapshot ?? {}) as Record<string, unknown>;
        const name = typeof snap.name === 'string' ? snap.name : 'Sản phẩm thời trang';
        const variantLabel = typeof snap.variantLabel === 'string' ? ` (${snap.variantLabel})` : '';
        return {
          name: `${name}${variantLabel}`.trim(),
          code: item.productVariantId,
          quantity: item.quantity,
          weightGrams: 300,
          price: Math.max(0, Math.round(Number(item.unitPrice))),
        };
      }),
    };
  }

  private toResponse(
    shipment: ShipmentRow,
    extra?: { fallbackUsed?: boolean; fallbackReason?: string | null },
  ): ShipmentResponse {
    return {
      id: shipment.id,
      orderId: shipment.orderId,
      carrierName: shipment.carrierName,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status as ShipmentStatus,
      isMock: shipment.isMock ?? true,
      carrierStatus: shipment.carrierStatus ?? null,
      statusNote: shipment.statusNote ?? null,
      expectedDeliveryAt: shipment.expectedDeliveryAt
        ? shipment.expectedDeliveryAt.toISOString()
        : null,
      ...(extra?.fallbackUsed !== undefined ? { fallbackUsed: extra.fallbackUsed } : {}),
      ...(extra?.fallbackReason !== undefined ? { fallbackReason: extra.fallbackReason } : {}),
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }
}
