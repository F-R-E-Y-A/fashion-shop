import { Injectable, Logger, type MessageEvent, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { filter, interval, map, merge, type Observable, Subject } from 'rxjs';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { NotificationType } from '../../generated/prisma/enums.js';
import { type Env, webPublicOrigin } from '../../infra/config/env.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  CreateNotificationInput,
  ListNotificationsQuery,
  NotificationListResponse,
  NotificationResponse,
} from './dto/notification.dto.js';

export type OrderCancelSource = 'CUSTOMER' | 'EXPIRED' | 'ADMIN' | 'DELIVERY_FAILED';

export interface OrderStatusNotificationContext {
  carrierName?: string | null;
  trackingNumber?: string | null;
  isMockShipment?: boolean;
  expectedDeliveryAt?: string | null;
  reason?: string | null;
  note?: string | null;
  refundedAmount?: string | number | Prisma.Decimal;
  cancelSource?: OrderCancelSource;
  fromCarrierWebhook?: boolean;
}

export interface OrderEmailInfo {
  id: string;
  orderCode: string;
  customerEmail: string;
  userId?: string | null;
  status: OrderStatus;
  totalAmount?: string | number | Prisma.Decimal;
  shippingAddressSnapshot?: unknown;
  context?: OrderStatusNotificationContext;
}

export interface ShipmentFailureNotificationInfo {
  id: string;
  orderCode: string;
  customerEmail: string;
  userId?: string | null;
  carrierName?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
}

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  PENDING_CONFIRMATION: 'Chờ xác nhận (COD)',
  PAYMENT_REVIEW: 'Chờ đối soát thanh toán',
  CONFIRMED: 'Đã thanh toán · chờ đóng gói',
  PROCESSING: 'Đang đóng gói',
  SHIPPED: 'Đang giao hàng',
  DELIVERED: 'Đã giao thành công',
  CANCELLED: 'Đã hủy',
  PARTIALLY_REFUNDED: 'Đã hoàn tiền một phần',
  REFUNDED: 'Đã hoàn tiền',
};

const STATUS_NOTIFICATION_TYPE: Record<OrderStatus, NotificationType> = {
  PENDING_PAYMENT: NotificationType.ORDER_CREATED,
  PENDING_CONFIRMATION: NotificationType.ORDER_CREATED,
  CONFIRMED: NotificationType.PAYMENT_RECEIVED,
  PAYMENT_REVIEW: NotificationType.ORDER_STATUS_CHANGED,
  PROCESSING: NotificationType.ORDER_STATUS_CHANGED,
  SHIPPED: NotificationType.ORDER_STATUS_CHANGED,
  DELIVERED: NotificationType.ORDER_STATUS_CHANGED,
  CANCELLED: NotificationType.ORDER_STATUS_CHANGED,
  PARTIALLY_REFUNDED: NotificationType.REFUND_PROCESSED,
  REFUNDED: NotificationType.REFUND_PROCESSED,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly events$ = new Subject<{
    userId?: string | null;
    forAdmin: boolean;
    notification: NotificationResponse;
  }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Optional() private readonly config?: ConfigService<Env, true>,
  ) {}

  /**
   * Tạo thông báo mới trong cơ sở dữ liệu và phát sự kiện realtime qua SSE.
   */
  async create(input: CreateNotificationInput): Promise<NotificationResponse> {
    const record = await this.prisma.notification.create({
      data: {
        userId: input.userId ?? null,
        forAdmin: input.forAdmin ?? false,
        type: input.type ?? NotificationType.ORDER_STATUS_CHANGED,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        orderId: input.orderId ?? null,
      },
    });

    const response = this.mapToResponse(record);

    this.events$.next({
      userId: record.userId,
      forAdmin: record.forAdmin,
      notification: response,
    });

    return response;
  }

  /**
   * Danh sách thông báo của người dùng kèm số lượng chưa đọc.
   */
  async listUser(userId: string, query: ListNotificationsQuery): Promise<NotificationListResponse> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.NotificationWhereInput = {
      userId,
      forAdmin: false,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { userId, forAdmin: false, isRead: false },
      }),
    ]);

    return {
      items: items.map((item) => this.mapToResponse(item)),
      total,
      unreadCount,
      page,
      pageSize,
    };
  }

  /**
   * Danh sách thông báo cho quản trị viên.
   */
  async listAdmin(query: ListNotificationsQuery): Promise<NotificationListResponse> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.NotificationWhereInput = {
      forAdmin: true,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { forAdmin: true, isRead: false },
      }),
    ]);

    return {
      items: items.map((item) => this.mapToResponse(item)),
      total,
      unreadCount,
      page,
      pageSize,
    };
  }

  /**
   * Lấy số lượng thông báo chưa đọc.
   */
  async getUnreadCount(userId?: string, forAdmin = false): Promise<{ unreadCount: number }> {
    if (!forAdmin && !userId) {
      return { unreadCount: 0 };
    }
    const where: Prisma.NotificationWhereInput = forAdmin
      ? { forAdmin: true, isRead: false }
      : { userId, forAdmin: false, isRead: false };

    const unreadCount = await this.prisma.notification.count({ where });
    return { unreadCount };
  }

  /**
   * Đánh dấu 1 thông báo là đã đọc.
   */
  async markAsRead(id: string, userId?: string, forAdmin = false): Promise<NotificationResponse> {
    if (!forAdmin && !userId) {
      throw new NotFoundException('Không tìm thấy thông báo hoặc bạn không có quyền.');
    }
    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        ...(forAdmin ? { forAdmin: true } : { userId, forAdmin: false }),
      },
    });

    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo hoặc bạn không có quyền.');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return this.mapToResponse(updated);
  }

  /**
   * Đánh dấu toàn bộ thông báo là đã đọc.
   */
  async markAllAsRead(userId?: string, forAdmin = false): Promise<{ count: number }> {
    if (!forAdmin && !userId) {
      return { count: 0 };
    }
    const where: Prisma.NotificationWhereInput = forAdmin
      ? { forAdmin: true, isRead: false }
      : { userId, forAdmin: false, isRead: false };

    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return { count: result.count };
  }

  /**
   * Gửi email và tạo thông báo đa kênh khi trạng thái đơn hàng thay đổi.
   */
  async handleOrderStatusChange(
    order: OrderEmailInfo,
    newStatus: OrderStatus,
    _previousStatus?: OrderStatus,
    contextOverride?: OrderStatusNotificationContext,
  ): Promise<void> {
    const context = contextOverride ?? order.context;
    const statusMeta = this.getOrderStatusMeta(order, newStatus, context);
    const customerLink = `/don-hang/${order.id}`;
    const adminLink = `/admin/orders/${order.id}`;
    const notificationType =
      STATUS_NOTIFICATION_TYPE[newStatus] ?? NotificationType.ORDER_STATUS_CHANGED;

    // 1. Kênh In-App + SSE realtime cho khách hàng (nếu đơn gắn tài khoản)
    if (order.userId) {
      await this.create({
        userId: order.userId,
        forAdmin: false,
        type: notificationType,
        title: statusMeta.title,
        message: statusMeta.message,
        link: customerLink,
        orderId: order.id,
      });
    }

    // 2. Kênh In-App + SSE realtime cho Admin ở các mốc cần tiếp nhận hoặc đối soát
    if (this.shouldNotifyAdmin(newStatus, context)) {
      await this.create({
        forAdmin: true,
        type:
          newStatus === 'CONFIRMED' || newStatus === 'PENDING_CONFIRMATION'
            ? NotificationType.ORDER_CREATED
            : notificationType,
        title: `Đơn hàng ${order.orderCode}: ${statusMeta.adminTitle}`,
        message: statusMeta.adminMessage,
        link: adminLink,
        orderId: order.id,
      });
    }

    // 3. Kênh Email giao dịch bất đồng bộ (không chặn giao dịch đơn hàng khi SMTP chậm/lỗi)
    if (order.customerEmail) {
      const details: Array<{ label: string; value: string }> = [
        { label: 'Mã đơn hàng', value: order.orderCode },
        { label: 'Trạng thái', value: ORDER_STATUS_LABELS[newStatus] ?? newStatus },
      ];
      const formattedTotal = formatVnd(order.totalAmount);
      if (formattedTotal) {
        details.push({ label: 'Tổng thanh toán', value: formattedTotal });
      }
      const formattedRefund = formatVnd(context?.refundedAmount);
      if (formattedRefund && ['PARTIALLY_REFUNDED', 'REFUNDED'].includes(newStatus)) {
        details.push({ label: 'Số tiền hoàn', value: formattedRefund });
      }
      if (context?.trackingNumber) {
        const carrier = context.carrierName || 'GHN';
        details.push({ label: 'Đơn vị vận chuyển', value: carrier });
        details.push({ label: 'Mã vận đơn', value: context.trackingNumber });
      }
      if (context?.expectedDeliveryAt) {
        details.push({ label: 'Dự kiến giao', value: formatDateVi(context.expectedDeliveryAt) });
      }
      const noteOrReason = context?.reason?.trim() || context?.note?.trim();
      if (noteOrReason) {
        details.push({ label: 'Ghi chú', value: noteOrReason });
      }

      this.dispatchOrderEmail({
        to: order.customerEmail,
        orderCode: order.orderCode,
        title: statusMeta.title,
        message: statusMeta.message,
        relativePath: customerLink,
        details,
      });
    }
  }

  /**
   * Thông báo cho khách khi đơn đã ở trạng thái PROCESSING (vd COD đã xác nhận trước đó) và shop vừa gắn vận đơn mới.
   */
  async notifyShipmentCreated(
    order: Omit<OrderEmailInfo, 'status'>,
    shipment: {
      carrierName?: string | null;
      trackingNumber?: string | null;
      isMock?: boolean;
      expectedDeliveryAt?: string | null;
    },
  ): Promise<void> {
    if (!shipment.trackingNumber) return;
    const carrier = shipment.carrierName || 'GHN';
    const customerLink = `/don-hang/${order.id}`;
    const title = `Đơn hàng ${order.orderCode} đã được tạo vận đơn ${carrier}`;
    const modeNote = shipment.isMock ? ' (mô phỏng sandbox)' : '';
    const message =
      `Đơn hàng của bạn đã có mã vận đơn ${shipment.trackingNumber}${modeNote} từ ${carrier}. ` +
      'Đơn vị vận chuyển sẽ sớm đến lấy hàng để giao cho bạn.';

    if (order.userId) {
      await this.create({
        userId: order.userId,
        forAdmin: false,
        type: NotificationType.ORDER_STATUS_CHANGED,
        title,
        message,
        link: customerLink,
        orderId: order.id,
      });
    }

    if (order.customerEmail) {
      const details: Array<{ label: string; value: string }> = [
        { label: 'Mã đơn hàng', value: order.orderCode },
        { label: 'Đơn vị vận chuyển', value: `${carrier}${modeNote}` },
        { label: 'Mã vận đơn', value: shipment.trackingNumber },
      ];
      if (shipment.expectedDeliveryAt) {
        details.push({
          label: 'Dự kiến giao',
          value: formatDateVi(shipment.expectedDeliveryAt),
        });
      }
      this.dispatchOrderEmail({
        to: order.customerEmail,
        orderCode: order.orderCode,
        title,
        message,
        relativePath: customerLink,
        details,
      });
    }
  }

  /**
   * Thông báo khi vận đơn gặp sự cố giao hàng (FAILED) trong khi hàng vẫn đang trên tuyến và đơn chưa hủy.
   */
  async notifyShipmentFailed(info: ShipmentFailureNotificationInfo): Promise<void> {
    const carrier = info.carrierName || 'GHN';
    const customerLink = `/don-hang/${info.id}`;
    const adminLink = `/admin/orders/${info.id}`;
    const reasonText = info.note?.trim() || 'Đơn vị vận chuyển chưa liên lạc được người nhận.';
    const title = `Đơn hàng ${info.orderCode} giao hàng chưa thành công`;
    const message =
      `${carrier} báo chưa giao thành công đơn hàng ${info.orderCode} (${reasonText}). ` +
      'Vui lòng giữ liên lạc điện thoại hoặc kiểm tra chi tiết đơn hàng để được hỗ trợ giao lại.';

    if (info.userId) {
      await this.create({
        userId: info.userId,
        forAdmin: false,
        type: NotificationType.ORDER_STATUS_CHANGED,
        title,
        message,
        link: customerLink,
        orderId: info.id,
      });
    }

    await this.create({
      forAdmin: true,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: `Đơn hàng ${info.orderCode}: Giao hàng chưa thành công`,
      message: `${carrier} (${info.trackingNumber ?? 'chưa có mã'}) cập nhật giao thất bại: ${reasonText}`,
      link: adminLink,
      orderId: info.id,
    });

    if (info.customerEmail) {
      const details: Array<{ label: string; value: string }> = [
        { label: 'Mã đơn hàng', value: info.orderCode },
        { label: 'Đơn vị vận chuyển', value: carrier },
      ];
      if (info.trackingNumber) {
        details.push({ label: 'Mã vận đơn', value: info.trackingNumber });
      }
      details.push({ label: 'Lý do', value: reasonText });
      this.dispatchOrderEmail({
        to: info.customerEmail,
        orderCode: info.orderCode,
        title,
        message,
        relativePath: customerLink,
        details,
      });
    }
  }

  private shouldNotifyAdmin(status: OrderStatus, context?: OrderStatusNotificationContext) {
    if (
      status === 'PENDING_CONFIRMATION' ||
      status === 'CONFIRMED' ||
      status === 'PAYMENT_REVIEW' ||
      status === 'CANCELLED' ||
      status === 'PARTIALLY_REFUNDED' ||
      status === 'REFUNDED'
    ) {
      return true;
    }
    if (status === 'DELIVERED' && context?.fromCarrierWebhook) {
      return true;
    }
    return false;
  }

  private publicWebBaseUrl(): string {
    const cors = this.config?.get('CORS_ORIGINS', { infer: true }) ?? 'http://localhost:5174';
    const webUrl = this.config?.get('WEB_PUBLIC_URL', { infer: true });
    return webPublicOrigin(cors, webUrl);
  }

  private dispatchOrderEmail(input: {
    to: string;
    orderCode: string;
    title: string;
    message: string;
    relativePath: string;
    details: Array<{ label: string; value: string }>;
  }): void {
    const absoluteUrl = `${this.publicWebBaseUrl()}${input.relativePath}`;
    const detailLinesText = input.details.map((d) => `${d.label}: ${d.value}`).join('\n');
    const detailRowsHtml = input.details
      .map(
        (d) =>
          `<p style="margin: 4px 0;"><strong>${escapeHtml(d.label)}:</strong> ${escapeHtml(d.value)}</p>`,
      )
      .join('\n                ');

    try {
      void this.mail
        .send({
          to: input.to,
          subject: `[F.R.E.Y.A.] ${input.title}`,
          text: `${input.message}\n\n${detailLinesText}\nXem chi tiết đơn hàng: ${absoluteUrl}`,
          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
              <h2 style="color: #6b3e26; margin-bottom: 8px;">F.R.E.Y.A. Fashion</h2>
              <h3 style="margin-top: 0;">${escapeHtml(input.title)}</h3>
              <p>${escapeHtml(input.message)}</p>
              <div style="background: #fdfaf7; padding: 12px 16px; border-left: 4px solid #6b3e26; margin: 16px 0;">
                ${detailRowsHtml}
              </div>
              <p style="margin: 20px 0;">
                <a href="${escapeHtml(absoluteUrl)}" style="display: inline-block; background: #6b3e26; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 600;">Xem chi tiết đơn hàng</a>
              </p>
              <p style="font-size: 13px; color: #666;">Cảm ơn quý khách đã tin tưởng mua sắm tại F.R.E.Y.A.</p>
            </div>
          `,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Không gửi được email thông báo đơn ${input.orderCode}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    } catch (error: unknown) {
      this.logger.warn(
        `Không gửi được email thông báo đơn ${input.orderCode}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Luồng SSE theo thời gian thực cho người dùng.
   */
  userStream(userId: string): Observable<MessageEvent> {
    const liveNotifications$ = this.events$.pipe(
      filter((e) => !e.forAdmin && e.userId === userId),
      map((e): MessageEvent => ({
        type: 'notification',
        data: e.notification,
      })),
    );

    const heartbeats$ = interval(15_000).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(liveNotifications$, heartbeats$);
  }

  /**
   * Luồng SSE theo thời gian thực cho Admin.
   */
  adminStream(): Observable<MessageEvent> {
    const liveNotifications$ = this.events$.pipe(
      filter((e) => e.forAdmin),
      map((e): MessageEvent => ({
        type: 'notification',
        data: e.notification,
      })),
    );

    const heartbeats$ = interval(15_000).pipe(
      map((): MessageEvent => ({ type: 'heartbeat', data: {} })),
    );

    return merge(liveNotifications$, heartbeats$);
  }

  private mapToResponse(record: {
    id: string;
    userId: string | null;
    forAdmin: boolean;
    type: NotificationType;
    title: string;
    message: string;
    link: string | null;
    isRead: boolean;
    orderId: string | null;
    createdAt: Date;
  }): NotificationResponse {
    return {
      id: record.id,
      userId: record.userId,
      forAdmin: record.forAdmin,
      type: record.type,
      title: record.title,
      message: record.message,
      link: record.link,
      isRead: record.isRead,
      orderId: record.orderId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private getOrderStatusMeta(
    order: OrderEmailInfo,
    status: OrderStatus,
    context?: OrderStatusNotificationContext,
  ) {
    const { orderCode, customerEmail } = order;
    const totalText = formatVnd(order.totalAmount);
    const trackingSuffix = context?.trackingNumber
      ? ` (mã vận đơn ${context.trackingNumber} · ${context.carrierName || 'GHN'})`
      : '';

    switch (status) {
      case 'PENDING_PAYMENT':
        return {
          title: `Đơn hàng ${orderCode} đang chờ thanh toán`,
          message: `Đơn hàng của bạn${totalText ? ` (${totalText})` : ''} đã được tiếp nhận và đang chờ hoàn tất thanh toán. Vui lòng thanh toán trước khi hết hạn giữ hàng.`,
          adminTitle: 'Đơn hàng mới chờ thanh toán',
          adminMessage: `Đơn ${orderCode} của khách ${customerEmail} đang chờ thanh toán trực tuyến.`,
        };
      case 'PENDING_CONFIRMATION':
        return {
          title: `Đơn hàng ${orderCode} (COD) đang chờ xác nhận`,
          message: `F.R.E.Y.A. đã ghi nhận đơn đặt hàng COD${totalText ? ` tổng ${totalText}` : ''} của bạn. Chúng tôi sẽ liên hệ xác nhận trong thời gian sớm nhất.`,
          adminTitle: 'Đơn COD mới cần xác nhận',
          adminMessage: `Khách ${customerEmail} vừa đặt đơn COD ${orderCode}${totalText ? ` (${totalText})` : ''}. Vui lòng gọi xác nhận và giao hàng.`,
        };
      case 'CONFIRMED':
        return {
          title: `Đơn hàng ${orderCode} đã được thanh toán thành công`,
          message: `Chúng tôi đã nhận được thanh toán${totalText ? ` ${totalText}` : ''} cho đơn hàng ${orderCode}. Đơn hàng đang được chuẩn bị để đóng gói.`,
          adminTitle: 'Đã nhận thanh toán thành công',
          adminMessage: `Đơn ${orderCode} của khách ${customerEmail} đã thanh toán thành công và sẵn sàng đóng gói.`,
        };
      case 'PROCESSING':
        return {
          title: `Đơn hàng ${orderCode} đang được đóng gói`,
          message: `Đơn hàng của bạn đang được nhân viên kho đóng gói cẩn thận để bàn giao cho đối tác vận chuyển${trackingSuffix}.`,
          adminTitle: 'Đơn hàng chuyển sang xử lý / đóng gói',
          adminMessage: `Đơn ${orderCode} đã chuyển sang trạng thái đang đóng gói.`,
        };
      case 'SHIPPED':
        return {
          title: `Đơn hàng ${orderCode} đã được gửi đi`,
          message: `Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển${trackingSuffix} và đang trên đường giao đến bạn.`,
          adminTitle: 'Đã xuất kho giao vận chuyển',
          adminMessage: `Đơn ${orderCode} đã bàn giao cho ${context?.carrierName || 'GHN'}${context?.trackingNumber ? ` (${context.trackingNumber})` : ''}.`,
        };
      case 'DELIVERED':
        return {
          title: `Đơn hàng ${orderCode} đã giao thành công`,
          message: `Đơn hàng đã được giao thành công. Bạn có thể đánh giá sản phẩm trong vòng 30 ngày hoặc gửi yêu cầu trả hàng trong 15 ngày nếu cần hỗ trợ.`,
          adminTitle: 'Đơn hàng đã giao thành công',
          adminMessage: `Đơn ${orderCode} đã giao thành công${context?.fromCarrierWebhook ? ' (đồng bộ từ hãng vận chuyển)' : ''}.`,
        };
      case 'CANCELLED': {
        const cancelMeta = describeCancellation(orderCode, customerEmail, context);
        return cancelMeta;
      }
      case 'PARTIALLY_REFUNDED': {
        const refundText = formatVnd(context?.refundedAmount);
        return {
          title: `Hoàn tiền một phần cho đơn hàng ${orderCode}`,
          message: `Khoản hoàn${refundText ? ` ${refundText}` : ''} cho đơn hàng ${orderCode} đã được xử lý. Thời gian tiền về tài khoản tùy thuộc ngân hàng hoặc ví của bạn.`,
          adminTitle: 'Đã hoàn tiền một phần',
          adminMessage: `Đơn ${orderCode} đã ghi nhận hoàn tiền một phần${refundText ? ` (${refundText})` : ''}.`,
        };
      }
      case 'REFUNDED': {
        const refundText = formatVnd(context?.refundedAmount ?? order.totalAmount);
        return {
          title: `Hoàn tiền toàn bộ cho đơn hàng ${orderCode}`,
          message: `Yêu cầu hoàn tiền${refundText ? ` ${refundText}` : ''} cho đơn hàng ${orderCode} đã được xử lý thành công.`,
          adminTitle: 'Hoàn tiền đơn hàng đã hoàn tất',
          adminMessage: `Đơn ${orderCode} đã hoàn tất hoàn tiền${refundText ? ` (${refundText})` : ''}.`,
        };
      }
      case 'PAYMENT_REVIEW':
        return {
          title: `Đơn hàng ${orderCode} đang chờ đối soát thanh toán`,
          message: `Giao dịch của bạn đang được hệ thống và cổng thanh toán kiểm tra đối chiếu. Không cần thanh toán lại — chúng tôi sẽ cập nhật ngay khi hoàn tất.`,
          adminTitle: 'Cần đối soát thanh toán',
          adminMessage: `Đơn ${orderCode} của khách ${customerEmail} có giao dịch cần quản trị viên đối soát.`,
        };
      default: {
        const label = ORDER_STATUS_LABELS[status] ?? status;
        return {
          title: `Cập nhật trạng thái đơn hàng ${orderCode}`,
          message: `Đơn hàng của bạn đã chuyển sang trạng thái: ${label}.`,
          adminTitle: `Cập nhật trạng thái: ${label}`,
          adminMessage: `Đơn ${orderCode} của khách ${customerEmail} đã chuyển sang trạng thái: ${label}.`,
        };
      }
    }
  }
}

function describeCancellation(
  orderCode: string,
  customerEmail: string,
  context?: OrderStatusNotificationContext,
) {
  const reasonSuffix = context?.reason ? ` Lý do: ${context.reason}` : '';
  switch (context?.cancelSource) {
    case 'EXPIRED':
      return {
        title: `Đơn hàng ${orderCode} đã hủy do quá hạn`,
        message: `Đơn hàng ${orderCode} đã tự động hủy vì hết thời hạn thanh toán hoặc xác nhận. Sản phẩm vẫn được giữ lại trong giỏ để bạn đặt lại bất cứ lúc nào.`,
        adminTitle: 'Đơn tự hủy do quá hạn',
        adminMessage: `Đơn ${orderCode} của khách ${customerEmail} đã tự động hủy do quá thời hạn thanh toán/giữ hàng.`,
      };
    case 'DELIVERY_FAILED':
      return {
        title: `Đơn hàng ${orderCode} đã hủy do giao hàng không thành công`,
        message: `Đơn hàng COD ${orderCode} không giao thành công và đã hoàn về kho.${reasonSuffix} Nếu bạn vẫn muốn mua, vui lòng đặt lại đơn hàng mới.`,
        adminTitle: 'Giao COD thất bại — hàng đã hoàn kho',
        adminMessage: `Đơn ${orderCode} của khách ${customerEmail} giao thất bại, hàng đã hoàn kho và hủy đơn.${reasonSuffix}`,
      };
    case 'ADMIN':
      return {
        title: `Đơn hàng ${orderCode} đã được cửa hàng hủy`,
        message: `Cửa hàng đã hủy đơn hàng ${orderCode}.${reasonSuffix} Nếu đơn đã thanh toán trước, khoản tiền sẽ được hoàn lại về phương thức thanh toán ban đầu.`,
        adminTitle: 'Quản trị viên đã hủy đơn',
        adminMessage: `Đơn ${orderCode} của khách ${customerEmail} đã được quản trị viên hủy.${reasonSuffix}`,
      };
    case 'CUSTOMER':
    default:
      return {
        title: `Đơn hàng ${orderCode} đã được hủy`,
        message: `Đơn hàng ${orderCode} đã được ghi nhận hủy thành công. Nếu bạn đã thanh toán, khoản tiền sẽ được đối soát hoàn trả theo quy định.`,
        adminTitle: 'Khách yêu cầu hủy đơn hàng',
        adminMessage: `Khách ${customerEmail} đã hủy đơn ${orderCode}.${reasonSuffix}`,
      };
  }
}

function formatVnd(amount?: string | number | Prisma.Decimal): string | null {
  if (amount === undefined || amount === null || amount === '') return null;
  const num = Number(
    typeof amount === 'object' && 'toString' in amount ? amount.toString() : amount,
  );
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(num))}đ`;
}

function formatDateVi(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
