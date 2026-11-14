import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';
import { CloudinaryImageStorage, parseCloudinaryUrl } from './cloudinary-image-storage.js';
import { DisabledImageStorage, ImageStorage } from './image-storage.js';

/** Co CLOUDINARY_URL hop le thi dung Cloudinary, khong thi kho tat (tai anh tra 503). */
@Module({
  providers: [
    {
      provide: ImageStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ImageStorage => {
        const credentials = parseCloudinaryUrl(config.get('CLOUDINARY_URL', { infer: true }) ?? '');
        return credentials ? new CloudinaryImageStorage(credentials) : new DisabledImageStorage();
      },
    },
  ],
  exports: [ImageStorage],
})
export class StorageModule {}
