import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../infra/config/env.js';
import { RateLimitModule } from '../../infra/rate-limit/rate-limit.module.js';
import { AuthModule } from '../auth/index.js';
import { InventoryModule } from '../inventory/index.js';
import { AdminCategoriesController } from './admin-categories.controller.js';
import { AdminCategoriesService } from './admin-categories.service.js';
import { AdminProductsController } from './admin-products.controller.js';
import { AdminProductsService } from './admin-products.service.js';
import { CatalogEventsService } from './catalog-events.service.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { CatalogSearchService } from './search/catalog-search.service.js';
import { SearchController } from './search/search.controller.js';
import { SearchDictionaryService } from './search/search-dictionary.service.js';
import { EMBEDDER } from './search/semantic/embedder.js';
import { SemanticIndexService } from './search/semantic/semantic-index.service.js';
import { TransformersEmbedder } from './search/semantic/transformers-embedder.js';
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
  imports: [RateLimitModule, InventoryModule, AuthModule],
  controllers: [
    AdminCategoriesController,
    AdminProductsController,
    ProductsController,
    CategoriesController,
    SearchController,
  ],
  providers: [
    ProductsService,
    AdminCategoriesService,
    AdminProductsService,
    CatalogEventsService,
    CategoriesService,
    CatalogSearchService,
    SearchDictionaryService,
    SuggestRateLimitService,
    SemanticIndexService,
    {
      // SEARCH_SEMANTIC=off thi null: SemanticIndexService tra null, tim theo luat (ADR-048).
      provide: EMBEDDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('SEARCH_SEMANTIC', { infer: true }) === 'local'
          ? new TransformersEmbedder(
              config.get('SEARCH_EMBED_MODEL', { infer: true }),
              config.get('SEARCH_MODEL_DIR', { infer: true }),
            )
          : null,
    },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
