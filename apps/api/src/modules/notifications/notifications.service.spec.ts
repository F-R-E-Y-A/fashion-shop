import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { NotificationType } from '../../generated/prisma/enums.js';
import { MailService } from '../../infra/mail/mail.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ListNotificationsQuery } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  const mockMail = {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as MailService;

  const mockNotification = {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };

  const mockPrisma = {
    notification: mockNotification,
  } as unknown as PrismaService;

  it('create tạo thông báo và trả về DTO phản hồi', async () => {
    const service = new NotificationsService(mockPrisma, mockMail);
    const mockRecord = {
      id: 'n1',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đơn hàng mới',
      message: 'Nội dung thông báo',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date('2026-11-09T00:00:00Z'),
      updatedAt: new Date('2026-11-09T00:00:00Z'),
    };
    mockNotification.create.mockResolvedValue(mockRecord);

    const result = await service.create({
      userId: 'u1',
      title: 'Đơn hàng mới',
      message: 'Nội dung thông báo',
      link: '/don-hang/o1',
      orderId: 'o1',
    });

    expect(result.id).toBe('n1');
    expect(result.title).toBe('Đơn hàng mới');
    expect(result.createdAt).toBe('2026-11-09T00:00:00.000Z');
  });

  it('listUser phân trang và đếm unreadCount chính xác', async () => {
    const service = new NotificationsService(mockPrisma, mockMail);
    const mockItems = [
      {
        id: 'n1',
        userId: 'u1',
        forAdmin: false,
        type: NotificationType.ORDER_STATUS_CHANGED,
        title: 'Đơn 1',
        message: 'Msg 1',
        link: null,
        isRead: false,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockNotification.findMany.mockResolvedValue(mockItems);
    mockNotification.count
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1); // unreadCount

    const res = await service.listUser('u1', { page: 1, pageSize: 10 });
    expect(res.items).toHaveLength(1);
    expect(res.total).toBe(1);
    expect(res.unreadCount).toBe(1);
  });

  it('handleOrderStatusChange gửi email qua MailService và tạo thông báo in-app', async () => {
    const service = new NotificationsService(mockPrisma, mockMail);
    mockNotification.create.mockResolvedValue({
      id: 'n2',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'Đơn hàng FR001 đã được thanh toán thành công',
      message: 'Msg',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.handleOrderStatusChange(
      {
        id: 'o1',
        orderCode: 'FR001',
        customerEmail: 'khach@example.com',
        userId: 'u1',
        status: 'CONFIRMED',
      },
      'CONFIRMED',
    );

    expect(mockMail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'khach@example.com',
        subject: expect.stringContaining('FR001'),
      }),
    );
    expect(mockNotification.create).toHaveBeenCalled();
  });

  it('markAsRead cập nhật trạng thái đã đọc', async () => {
    const service = new NotificationsService(mockPrisma, mockMail);
    mockNotification.findFirst.mockResolvedValue({ id: 'n1', userId: 'u1' });
    mockNotification.update.mockResolvedValue({
      id: 'n1',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.SYSTEM,
      title: 'T1',
      message: 'M1',
      link: null,
      isRead: true,
      orderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await service.markAsRead('n1', 'u1');
    expect(res.isRead).toBe(true);
    expect(mockNotification.findFirst).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1', forAdmin: false },
    });
  });

  it('log cảnh báo khi gửi email thất bại thay vì nuốt lỗi im lặng', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failingMail = {
      send: vi.fn().mockRejectedValue(new Error('SMTP timeout')),
    } as unknown as MailService;
    const service = new NotificationsService(mockPrisma, failingMail);
    mockNotification.create.mockResolvedValue({
      id: 'n3',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'T',
      message: 'M',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.handleOrderStatusChange(
      {
        id: 'o1',
        orderCode: 'FR002',
        customerEmail: 'khach@example.com',
        userId: 'u1',
        status: 'SHIPPED',
      },
      'SHIPPED',
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP timeout'));
    warnSpy.mockRestore();
  });

  it('handleOrderStatusChange giải phóng ngay lập tức không bị treo khi MailService.send bị treo', async () => {
    // Giả lập SMTP bị pending vô hạn (hỏng kết nối, server mail không trả ACK)
    const hangingMail = {
      send: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as MailService;
    const service = new NotificationsService(mockPrisma, hangingMail);
    mockNotification.create.mockResolvedValue({
      id: 'n4',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'T',
      message: 'M',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Phải hoàn thành ngay, không bị treo theo SMTP
    let finished = false;
    const promise = service
      .handleOrderStatusChange(
        {
          id: 'o1',
          orderCode: 'FR003',
          customerEmail: 'khach@example.com',
          userId: 'u1',
          status: 'SHIPPED',
        },
        'SHIPPED',
      )
      .then(() => {
        finished = true;
      });

    await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: SMTP blocked execution')), 500),
      ),
    ]);

    expect(finished).toBe(true);
    expect(hangingMail.send).toHaveBeenCalledTimes(1);
    expect(mockNotification.create).toHaveBeenCalled();
  });

  it('ListNotificationsQuery chuyển đổi chính xác unreadOnly=false và từ chối giá trị sai', async () => {
    const falseQuery = plainToInstance(ListNotificationsQuery, { unreadOnly: 'false' });
    expect(falseQuery.unreadOnly).toBe(false);
    expect(await validate(falseQuery)).toHaveLength(0);

    const trueQuery = plainToInstance(ListNotificationsQuery, { unreadOnly: 'true' });
    expect(trueQuery.unreadOnly).toBe(true);
    expect(await validate(trueQuery)).toHaveLength(0);

    const invalidQuery = plainToInstance(ListNotificationsQuery, { unreadOnly: 'abc' });
    expect((await validate(invalidQuery)).length).toBeGreaterThan(0);
  });

  it('handleOrderStatusChange dùng nhãn tiếng Việt, thoát HTML, phân biệt cancelSource và tạo full link WEB_PUBLIC_URL', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const mail = { send: mockSend } as unknown as MailService;
    const mockConfig = {
      get: vi.fn((key: string) => {
        if (key === 'WEB_PUBLIC_URL') return 'https://freya.shop';
        return undefined;
      }),
    } as unknown as import('@nestjs/config').ConfigService<
      import('../../infra/config/env.js').Env,
      true
    >;
    mockNotification.create.mockResolvedValue({
      id: 'n10',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'T',
      message: 'M',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new NotificationsService(mockPrisma, mail, mockConfig);
    await service.handleOrderStatusChange(
      {
        id: 'o1',
        orderCode: 'FR009',
        customerEmail: 'khach@freya.test',
        userId: 'u1',
        status: 'SHIPPED',
        totalAmount: '450000',
        context: {
          carrierName: 'GHN',
          trackingNumber: 'L4GHN001',
          isMockShipment: false,
          note: '<script>alert(1)</script>',
        },
      },
      'SHIPPED',
    );

    const shipMail = mockSend.mock.calls[0]![0];
    expect(shipMail.text).toContain('https://freya.shop/don-hang/o1');
    expect(shipMail.html).toContain('Đang giao hàng');
    expect(shipMail.html).not.toContain('SHIPPED');
    expect(shipMail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(shipMail.html).toContain('L4GHN001');

    mockSend.mockClear();
    await service.handleOrderStatusChange(
      {
        id: 'o2',
        orderCode: 'FR010',
        customerEmail: 'khach@freya.test',
        userId: 'u1',
        status: 'CANCELLED',
        context: { cancelSource: 'EXPIRED' },
      },
      'CANCELLED',
    );
    expect(mockSend.mock.calls[0]![0].text).toContain('hết thời hạn thanh toán');
    expect(mockSend.mock.calls[0]![0].subject).toContain('đã hủy do quá hạn');
  });

  it('notifyShipmentCreated và notifyShipmentFailed tạo thông báo in-app lẫn email cho khách và admin', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    const mail = { send: mockSend } as unknown as MailService;
    mockNotification.create.mockClear();
    mockNotification.create.mockResolvedValue({
      id: 'n20',
      userId: 'u1',
      forAdmin: false,
      type: NotificationType.ORDER_STATUS_CHANGED,
      title: 'T',
      message: 'M',
      link: '/don-hang/o1',
      isRead: false,
      orderId: 'o1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new NotificationsService(mockPrisma, mail);
    await service.notifyShipmentCreated(
      { id: 'o1', orderCode: 'FR011', customerEmail: 'khach@freya.test', userId: 'u1' },
      { carrierName: 'GHN', trackingNumber: 'L4SHIP1', isMock: false },
    );
    expect(mockNotification.create).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(1);

    mockNotification.create.mockClear();
    mockSend.mockClear();
    await service.notifyShipmentFailed({
      id: 'o1',
      orderCode: 'FR011',
      customerEmail: 'khach@freya.test',
      userId: 'u1',
      carrierName: 'GHN',
      trackingNumber: 'L4SHIP1',
      note: 'Thuê bao không liên lạc được',
    });
    expect(mockNotification.create).toHaveBeenCalledTimes(2); // 1 customer + 1 admin
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0]![0].text).toContain('Thuê bao không liên lạc được');
  });
});
