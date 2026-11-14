import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infra/prisma/prisma.module.js';
import { AuthModule } from '../auth/index.js';
import { OrdersModule } from '../orders/index.js';
import { PaymentsModule } from '../payments/index.js';
import { AdminReportingController } from './admin-reporting.controller.js';
import { ReportingService } from './reporting.service.js';
import { ReportingAggregatorService } from './reporting-aggregator.service.js';
import { ReportingRefreshWorker } from './reporting-refresh.worker.js';
import { OrdersSourceReader } from './source-readers/orders-source.reader.js';
import { PaymentsSourceReader } from './source-readers/payments-source.reader.js';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule, PaymentsModule],
  controllers: [AdminReportingController],
  providers: [
    PaymentsSourceReader,
    OrdersSourceReader,
    ReportingAggregatorService,
    ReportingService,
    ReportingRefreshWorker,
  ],
  exports: [ReportingService, ReportingAggregatorService, ReportingRefreshWorker],
})
export class ReportingModule {}
