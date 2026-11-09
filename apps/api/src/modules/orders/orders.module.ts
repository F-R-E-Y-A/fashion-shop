import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/index.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [NotificationsModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
