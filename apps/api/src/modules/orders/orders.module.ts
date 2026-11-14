import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/index.js';
import { OrdersService } from './orders.service.js';
import { OrdersReportingReader } from './orders-reporting.reader.js';

@Module({
  imports: [NotificationsModule],
  providers: [OrdersService, OrdersReportingReader],
  exports: [OrdersService, OrdersReportingReader],
})
export class OrdersModule {}
