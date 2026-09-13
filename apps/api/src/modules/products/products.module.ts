import { Module } from '@nestjs/common';

import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

/**
 * Module mau. Hai ban chep nguyen cay thu muc nay roi doi ten khi lam phan he cua minh.
 *
 * Luat bat bien cua nhom: mot phan he do mot nguoi lam tron tu bang du lieu
 * toi giao dien. Khi phan he khac can doc san pham thi tiem ProductsService,
 * khong tu viet truy van vao bang products.
 * Vi vay exports luon liet ke service, khong bao gio la controller.
 */
@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
