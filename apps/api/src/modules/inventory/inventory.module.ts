import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/index.js';
import { AdminInventoryController } from './admin-inventory.controller.js';
import { AdminInventoryService } from './admin-inventory.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService, AdminInventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
