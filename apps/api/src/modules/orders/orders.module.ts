import { Module } from '@nestjs/common';

import { OrdersService } from './orders.service.js';
import { OrdersReportingReader } from './orders-reporting.reader.js';
@Module({
  providers: [OrdersService, OrdersReportingReader],
  exports: [OrdersService, OrdersReportingReader],
})
export class OrdersModule {}
