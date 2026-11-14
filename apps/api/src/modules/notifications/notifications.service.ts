import { Injectable, Logger, type MessageEvent, NotFoundException } from '@nestjs/common';
import { filter, interval, map, merge, type Observable, Subject } from 'rxjs';

import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { NotificationType } from '../../generated/prisma/enums.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type {
  CreateNotificationInput,
  ListNotificationsQuery,
  NotificationListResponse,
  NotificationResponse,
} from './dto/notification.dto.js';

export interface OrderEmailInfo {
  id: string;
  orderCode: string;
  customerEmail: string;
  userId?: string | null;
  status: OrderStatus;
  totalAmount?: string | number | Prisma.Decimal;
  shippingAddressSnapshot?: unknown;
}

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
   * Gửi email và tạo thông báo tương ứng khi trạng thái đơn thay đổi.
   */
  async handleOrderStatusChange(
    order: OrderEmailInfo,
    newStatus: OrderStatus,
    _previousStatus?: OrderStatus,
  ): Promise<void> {
    const statusMeta = this.getOrderStatusMeta(order.orderCode, newStatus);
    const link = `/don-hang/${order.id}`;

    // 1. Tạo thông báo in-app cho khách nếu đơn thuộc tài khoản
    if (order.userId) {
      await this.create({
        userId: order.userId,
        forAdmin: false,
        type: NotificationType.ORDER_STATUS_CHANGED,
        title: statusMeta.title,
        message: statusMeta.message,
        link,
        orderId: order.id,
      });
    }

    // 2. Tạo thông báo cho Admin khi có sự kiện quan trọng (đơn mới, cần xử lý, hủy đơn)
    if (
      newStatus === 'PENDING_CONFIRMATION' ||
      newStatus === 'CONFIRMED' ||
      newStatus === 'PAYMENT_REVIEW' ||
      newStatus === 'CANCELLED'
    ) {
      await this.create({
        forAdmin: true,
        type:
          newStatus === 'CONFIRMED' || newStatus === 'PENDING_CONFIRMATION'
            ? NotificationType.ORDER_CREATED
            : NotificationType.ORDER_STATUS_CHANGED,
        title: `Đơn hàng ${order.orderCode}: ${statusMeta.adminTitle}`,
        message: `Đơn ${order.orderCode} của khách ${order.customerEmail} đã chuyển sang trạng thái: ${newStatus}.`,
        link: `/admin/orders?q=${order.orderCode}`,
        orderId: order.id,
      });
    }

    // 3. Gửi email thông báo cho khách hàng (bất đồng bộ để không chặn thanh toán/đơn hàng khi SMTP chậm/treo)
    if (order.customerEmail) {
      try {
        void this.mail
          .send({
            to: order.customerEmail,
            subject: `[F.R.E.Y.A.] ${statusMeta.title}`,
            text: `${statusMeta.message}\n\nMã đơn hàng: ${order.orderCode}\nXem chi tiết tại: ${link}`,
            html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
              <h2 style="color: #6b3e26;">F.R.E.Y.A. Fashion</h2>
              <h3>${statusMeta.title}</h3>
              <p>${statusMeta.message}</p>
              <div style="background: #fdfaf7; padding: 12px 16px; border-left: 4px solid #6b3e26; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>Mã đơn hàng:</strong> ${order.orderCode}</p>
                <p style="margin: 4px 0;"><strong>Trạng thái:</strong> ${newStatus}</p>
              </div>
              <p>Cảm ơn quý khách đã tin tưởng mua sắm tại F.R.E.Y.A.</p>
            </div>
          `,
          })
          .catch((error: unknown) => {
            this.logger.warn(
              `Không gửi được email thông báo đơn ${order.orderCode}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      } catch (error: unknown) {
        this.logger.warn(
          `Không gửi được email thông báo đơn ${order.orderCode}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
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

  private getOrderStatusMeta(orderCode: string, status: OrderStatus) {
    switch (status) {
      case 'PENDING_PAYMENT':
        return {
          title: `Đơn hàng ${orderCode} đang chờ thanh toán`,
          message: `Đơn hàng của bạn đã được tiếp nhận và đang chờ hoàn tất thanh toán. Vui lòng thanh toán trước khi hết hạn giữ hàng.`,
          adminTitle: 'Đơn hàng mới chờ thanh toán',
        };
      case 'PENDING_CONFIRMATION':
        return {
          title: `Đơn hàng ${orderCode} (COD) đang chờ xác nhận`,
          message: `F.R.E.Y.A. đã ghi nhận đơn đặt hàng COD của bạn. Chúng tôi sẽ liên hệ xác nhận trong thời gian sớm nhất.`,
          adminTitle: 'Đơn COD mới cần xác nhận',
        };
      case 'CONFIRMED':
        return {
          title: `Đơn hàng ${orderCode} đã được thanh toán thành công`,
          message: `Chúng tôi đã nhận được thanh toán cho đơn hàng ${orderCode}. Đơn hàng đang được chuẩn bị để đóng gói.`,
          adminTitle: 'Đã nhận thanh toán thành công',
        };
      case 'PROCESSING':
        return {
          title: `Đơn hàng ${orderCode} đang được đóng gói`,
          message: `Đơn hàng của bạn đang được nhân viên kho đóng gói cẩn thận để bàn giao cho đối tác vận chuyển.`,
          adminTitle: 'Đơn hàng chuyển sang xử lý / đóng gói',
        };
      case 'SHIPPED':
        return {
          title: `Đơn hàng ${orderCode} đã được gửi đi`,
          message: `Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển và đang trên đường giao đến bạn.`,
          adminTitle: 'Đã xuất kho giao vận chuyển',
        };
      case 'DELIVERED':
        return {
          title: `Đơn hàng ${orderCode} đã giao thành công`,
          message: `Đơn hàng đã được giao thành công. Chúc bạn có trải nghiệm tuyệt vời với các sản phẩm từ F.R.E.Y.A.!`,
          adminTitle: 'Đơn hàng đã giao thành công',
        };
      case 'CANCELLED':
        return {
          title: `Đơn hàng ${orderCode} đã được hủy`,
          message: `Đơn hàng ${orderCode} đã được ghi nhận hủy thành công. Nếu bạn đã thanh toán, khoản tiền sẽ được đối soát hoàn trả theo quy định.`,
          adminTitle: 'Khách yêu cầu hủy đơn hàng',
        };
      case 'PARTIALLY_REFUNDED':
      case 'REFUNDED':
        return {
          title: `Hoàn tiền cho đơn hàng ${orderCode}`,
          message: `Yêu cầu hoàn tiền cho đơn hàng ${orderCode} đã được xử lý thành công.`,
          adminTitle: 'Hoàn tiền đơn hàng đã hoàn tất',
        };
      case 'PAYMENT_REVIEW':
        return {
          title: `Đơn hàng ${orderCode} đang chờ đối soát thanh toán`,
          message: `Giao dịch của bạn đang được hệ thống và cổng thanh toán kiểm tra đối chiếu. Chúng tôi sẽ cập nhật ngay khi hoàn tất.`,
          adminTitle: 'Cần đối soát thanh toán',
        };
      default:
        return {
          title: `Cập nhật trạng thái đơn hàng ${orderCode}`,
          message: `Đơn hàng của bạn đã chuyển sang trạng thái ${status}.`,
          adminTitle: `Cập nhật trạng thái: ${status}`,
        };
    }
  }
}
