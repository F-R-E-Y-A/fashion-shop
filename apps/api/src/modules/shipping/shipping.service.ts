import { randomUUID } from 'node:crypto';

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
  createdAt: Date;
  updatedAt: Date;
};

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

    if (shouldCallGhn && this.ghn) {
      const snapshot = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { shipment: true, items: true, payments: true },
      });
      if (!snapshot) throw new NotFoundException('Không tìm thấy đơn hàng.');
      this.assertOrderReadyForShipment(snapshot);

      const carrierInput = this.buildCarrierInput(snapshot, requestedCarrier, customTracking);
      try {
        externalResult = await this.ghn.createOrder(carrierInput);
      } catch (err) {
        if (mode === 'GHN') throw err;
        fallbackReason = err instanceof Error ? err.message : String(err);
        fallbackUsed = true;
        this.logger.warn(
          `GHN Sandbox tạo vận đơn lỗi cho đơn ${snapshot.orderCode}, chuyển sang dự phòng mô phỏng: ${fallbackReason}`,
        );
        externalResult = await this.getMockGateway().createOrder(carrierInput);
      }
    }

    const postCommitHooks: PostCommitHook[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      attachPostCommitHooks(tx, postCommitHooks);
      if (this.orders) await this.orders.lock(orderId, tx);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      this.assertOrderReadyForShipment(order);

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
        },
        update: {
          carrierName: carrierResult.carrierName,
          trackingNumber: carrierResult.trackingNumber,
          isMock: carrierResult.isMock,
          carrierStatus: carrierResult.carrierStatus,
          statusNote: carrierResult.statusNote,
          expectedDeliveryAt: expectedDeliveryDate,
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

      return this.toResponse(shipment, {
        ...(fallbackUsed ? { fallbackUsed: true, fallbackReason } : {}),
      });
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
    });
  }

  async updateShipmentStatus(
    orderId: string,
    status: ShipmentStatus,
    actorUserId?: string,
    note?: string,
    meta?: { carrierStatus?: string; fromWebhook?: boolean },
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
      if (!order.shipment) throw new NotFoundException('Chưa tạo vận đơn cho đơn hàng này.');

      if (order.status === 'CANCELLED' && status !== 'FAILED' && status !== 'RETURNED') {
        throw new ConflictException('Đơn hàng đã bị hủy, không thể cập nhật vận chuyển.');
      }

      const currentStatus = order.shipment.status as ShipmentStatus;

      // Xử lý sự kiện trùng trạng thái nội bộ (ví dụ GHN đổi sub-status picking -> delivering trong IN_TRANSIT)
      if (currentStatus === status) {
        const subChanged =
          (meta?.carrierStatus !== undefined &&
            meta.carrierStatus !== order.shipment.carrierStatus) ||
          (note !== undefined && note !== order.shipment.statusNote);
        if (subChanged) {
          const refreshed = await tx.shipment.update({
            where: { orderId },
            data: {
              ...(meta?.carrierStatus !== undefined ? { carrierStatus: meta.carrierStatus } : {}),
              ...(note !== undefined ? { statusNote: note } : {}),
            },
          });
          return this.toResponse(refreshed);
        }
        return this.toResponse(order.shipment);
      }

      // Kiểm tra ma trận chuyển trạng thái: chặn lùi trạng thái
      if (!canTransitionShipment(currentStatus, status)) {
        throw new ConflictException(
          `Không thể chuyển trạng thái vận đơn từ ${currentStatus} sang ${status}.`,
        );
      }

      const updateData: Prisma.ShipmentUpdateInput = { status };
      if (meta?.carrierStatus !== undefined) updateData.carrierStatus = meta.carrierStatus;
      if (note !== undefined) updateData.statusNote = note;

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
          const cod = order.payments.find((p) => p.gateway === 'COD' && p.status === 'PENDING');
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
        const cod = order.payments.find((p) => p.gateway === 'COD' && p.status === 'PENDING');
        if (cod && ['PROCESSING', 'SHIPPED'].includes(order.status)) {
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
            const stockItems = order.items.map((i) => ({
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
    });
    await runPostCommitHooks(postCommitHooks);
    return result;
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
    });
  }

  private async applyWebhookEvent(payload: {
    orderId?: string;
    trackingNumber?: string;
    clientOrderCode?: string;
    status: ShipmentStatus;
    carrierStatus?: string;
    note?: string;
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
      shipment = await this.prisma.shipment.findFirst({
        where: { order: { orderCode: payload.clientOrderCode } },
      });
    }

    if (!shipment) {
      return { received: true, processed: false, message: 'Shipment not found' };
    }

    if (payload.trackingNumber && !shipment.trackingNumber) {
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: { trackingNumber: payload.trackingNumber },
      });
    }

    try {
      // Truyền actorUserId = undefined để DB ghi NULL hợp lệ cho cột UUID order_status_history.actor_user_id.
      const updated = await this.updateShipmentStatus(
        shipment.orderId,
        payload.status,
        undefined,
        payload.note,
        {
          carrierStatus: payload.carrierStatus,
          fromWebhook: true,
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

  private assertOrderReadyForShipment(order: {
    status: string;
    shipment: { status: string } | null;
  }) {
    if (['CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PAYMENT_REVIEW'].includes(order.status)) {
      throw new ConflictException(`Đơn hàng ở trạng thái ${order.status}, không thể tạo vận đơn.`);
    }
    if (['PENDING_PAYMENT', 'PENDING_CONFIRMATION'].includes(order.status)) {
      throw new ConflictException(
        'Đơn hàng chưa sẵn sàng để tạo vận đơn. Vui lòng xác nhận hoặc thanh toán trước.',
      );
    }
    if (order.shipment && order.shipment.status !== 'PENDING') {
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
  ): CreateCarrierShipmentInput {
    const addr = (order.shippingAddressSnapshot ?? {}) as Record<string, unknown>;
    const hasPendingCod = order.payments.some((p) => p.gateway === 'COD' && p.status === 'PENDING');
    const codAmount = hasPendingCod ? Math.max(0, Math.round(Number(order.totalAmount))) : 0;

    return {
      orderId: order.id,
      orderCode: order.orderCode,
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
