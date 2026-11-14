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
});
