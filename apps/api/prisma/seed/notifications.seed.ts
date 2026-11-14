import { PrismaClient } from '../../src/generated/prisma/client.js';
import { NotificationType } from '../../src/generated/prisma/enums.js';

export const SAMPLE_NOTIFICATIONS = [
  {
    id: '00000000-0000-4000-9000-000000000001',
    forAdmin: true,
    type: NotificationType.SYSTEM,
    title: 'Chào mừng bạn đến với hệ thống quản trị F.R.E.Y.A.',
    message: 'Hệ thống quản lý bán hàng và thông báo đã sẵn sàng hoạt động.',
    link: '/admin',
    isRead: false,
  },
];

export async function seedNotifications(prisma: PrismaClient): Promise<{ notifications: number }> {
  for (const n of SAMPLE_NOTIFICATIONS) {
    await prisma.notification.upsert({
      where: { id: n.id },
      update: {
        forAdmin: n.forAdmin,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        isRead: n.isRead,
      },
      create: n,
    });
  }

  return { notifications: SAMPLE_NOTIFICATIONS.length };
}
