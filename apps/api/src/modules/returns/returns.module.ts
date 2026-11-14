import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { CheckoutModule } from '../checkout/index.js';
import { UploadsModule } from '../uploads/index.js';
import { AdminReturnsController } from './admin-returns.controller.js';
import { AdminReturnsService } from './admin-returns.service.js';
import { OrderReturnsController, ReturnsController } from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

/**
 * Tra hang va hoan tien sau giao (UC-14.1, UC-14.2, ADR-067). Phu thuoc mot chieu: returns goi
 * checkout (khoa don, hoan tien, kho) va uploads (anh); khong phan he nao import nguoc lai.
 */
@Module({
  imports: [AuthModule, CheckoutModule, UploadsModule],
  controllers: [OrderReturnsController, ReturnsController, AdminReturnsController],
  providers: [ReturnsService, AdminReturnsService],
})
export class ReturnsModule {}
