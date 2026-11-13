import { Module } from '@nestjs/common';

import { RateLimitModule } from '../../infra/rate-limit/rate-limit.module.js';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { AuthModule } from '../auth/index.js';
import { MediaCleanupService } from './media-cleanup.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

/** Tai anh dung chung (ke hoach #6): reviews dung truoc, anh san pham cua quan tri dung sau. */
@Module({
  imports: [AuthModule, RateLimitModule, StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService, MediaCleanupService],
  exports: [UploadsService],
})
export class UploadsModule {}
