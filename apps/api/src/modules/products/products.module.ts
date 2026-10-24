import { Module } from '@nestjs/common';

import { RateLimitModule } from '../../infra/rate-limit/rate-limit.module.js';
import { InventoryModule } from '../inventory/index.js';
import { CatalogEventsService } from './catalog-events.service.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { CatalogSearchService } from './search/catalog-search.service.js';
import { SearchController } from './search/search.controller.js';
import { SearchDictionaryService } from './search/search-dictionary.service.js';
import { SuggestRateLimitService } from './search/suggest-rate-limit.service.js';

/**
 * Module mau. Hai ban chep nguyen cay thu muc nay roi doi ten khi lam phan he cua minh.
 *
 * Luat bat bien cua nhom: mot phan he do mot nguoi lam tron tu bang du lieu
 * toi giao dien. Khi phan he khac can doc san pham thi tiem ProductsService,
 * khong tu viet truy van vao bang products.
 * Vi vay exports luon liet ke service, khong bao gio la controller.
 */
@Module({
  imports: [RateLimitModule, InventoryModule],
  controllers: [ProductsController, CategoriesController, SearchController],
  providers: [
    ProductsService,
    CatalogEventsService,
    CategoriesService,
    CatalogSearchService,
    SearchDictionaryService,
    SuggestRateLimitService,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
