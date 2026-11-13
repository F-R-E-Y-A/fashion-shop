import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Decimal } from 'decimal.js';

import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { InventoryService } from '../inventory/index.js';
import { OrdersService } from '../orders/index.js';
import { PaymentsService } from '../payments/index.js';
import type { ShipmentResponse, ShipmentStatus, ShipmentWebhookDto } from './dto/shipment.dto.js';

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly orders?: OrdersService,
    @Optional() private readonly inventory?: InventoryService,
    @Optional() private readonly payments?: PaymentsService,
  ) {}

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
    return {
      id: shipment.id,
      orderId: shipment.orderId,
      carrierName: shipment.carrierName,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status as ShipmentStatus,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }

  async createShipment(
    orderId: string,
    dto: { carrierName?: string; trackingNumber?: string },
    actorUserId?: string,
  ): Promise<ShipmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');

      if (['CANCELLED', 'REFUNDED'].includes(order.status)) {
        throw new ConflictException(
          `Đơn hàng ở trạng thái ${order.status}, không thể tạo vận đơn.`,
        );
      }
      if (['PENDING_PAYMENT', 'PENDING_CONFIRMATION'].includes(order.status)) {
        throw new ConflictException(
          'Đơn hàng chưa sẵn sàng để tạo vận đơn. Vui lòng xác nhận hoặc thanh toán trước.',
        );
      }

      const carrierName = dto.carrierName?.trim() || 'GHN';
      const trackingNumber =
        dto.trackingNumber?.trim() ||
        `${carrierName.toUpperCase()}${order.orderCode.replace(/^FR/, '')}`;

      const shipment = await tx.shipment.upsert({
        where: { orderId },
        create: {
          orderId,
          carrierName,
          trackingNumber,
          status: 'PENDING',
        },
        update: {
          carrierName,
          trackingNumber,
        },
      });

      // Nếu đơn đang CONFIRMED, tự chuyển sang PROCESSING (chuẩn bị giao)
      if (order.status === 'CONFIRMED' && this.orders) {
        await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId);
      }

      return {
        id: shipment.id,
        orderId: shipment.orderId,
        carrierName: shipment.carrierName,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status as ShipmentStatus,
        createdAt: shipment.createdAt.toISOString(),
        updatedAt: shipment.updatedAt.toISOString(),
      };
    });
  }

  async updateShipmentStatus(
    orderId: string,
    status: ShipmentStatus,
    actorUserId?: string,
    note?: string,
  ): Promise<ShipmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { shipment: true, items: true, payments: true },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (!order.shipment) throw new NotFoundException('Chưa tạo vận đơn cho đơn hàng này.');

      const updatedShipment = await tx.shipment.update({
        where: { orderId },
        data: { status },
      });

      // Đồng bộ trạng thái đơn hàng theo luồng vận chuyển
      if (status === 'IN_TRANSIT') {
        if (order.status === 'CONFIRMED' && this.orders) {
          await this.orders.transition(orderId, 'PROCESSING', tx, actorUserId);
        }
        if ((order.status === 'PROCESSING' || order.status === 'CONFIRMED') && this.orders) {
          await this.orders.transition(orderId, 'SHIPPED', tx, actorUserId);
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
              `COD-DELIVERED:${order.orderCode}:${Date.now()}`,
              { note: note ?? 'Shipper giao hàng thành công', actor: actorUserId ?? 'CARRIER' },
              tx,
            );
          }
          await this.orders.transition(orderId, 'DELIVERED', tx, actorUserId);
        }
      } else if (status === 'FAILED' || status === 'RETURNED') {
        if (['PROCESSING', 'SHIPPED'].includes(order.status)) {
          const cod = order.payments.find((p) => p.gateway === 'COD' && p.status === 'PENDING');
          if (cod && this.payments) {
            await this.payments.record(
              cod.id,
              'FAILED',
              `COD-FAILED:${order.orderCode}:${Date.now()}`,
              { note: note ?? 'Giao thất bại', actor: actorUserId ?? 'CARRIER' },
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
          if (this.orders) {
            await this.orders.transition(orderId, 'CANCELLED', tx, actorUserId);
          }
        }
      }

      return {
        id: updatedShipment.id,
        orderId: updatedShipment.orderId,
        carrierName: updatedShipment.carrierName,
        trackingNumber: updatedShipment.trackingNumber,
        status: updatedShipment.status as ShipmentStatus,
        createdAt: updatedShipment.createdAt.toISOString(),
        updatedAt: updatedShipment.updatedAt.toISOString(),
      };
    });
  }

  async handleWebhook(payload: ShipmentWebhookDto) {
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

    if (!shipment) {
      return { received: true, processed: false, message: 'Shipment not found' };
    }

    if (payload.trackingNumber && !shipment.trackingNumber) {
      await this.prisma.shipment.update({
        where: { id: shipment.id },
        data: { trackingNumber: payload.trackingNumber },
      });
    }

    const updated = await this.updateShipmentStatus(
      shipment.orderId,
      payload.status,
      payload.carrierName ?? 'CARRIER_WEBHOOK',
      payload.note,
    );

    return {
      received: true,
      processed: true,
      orderId: shipment.orderId,
      status: updated.status,
    };
  }
}
