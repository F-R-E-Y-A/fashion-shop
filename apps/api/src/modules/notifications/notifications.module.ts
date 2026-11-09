import { Module } from '@nestjs/common';

import { MailModule } from '../../infra/mail/mail.module.js';
import { AdminNotificationsController } from './admin-notifications.controller.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [MailModule],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
