/**
 * CUA DUY NHAT cua phan he products. Phan he khac chi duoc import tu day (ESLint local/boundaries).
 * Xuat service de phan he khac DOC san pham; khong xuat controller, khong xuat gi cua Prisma.
 * Hop dong cong bo ghi o README.md cung thu muc.
 */
export type { ListProductsQuery } from './dto/list-products.query.js';
export { ProductListResponse, ProductResponse } from './dto/product.response.js';
export { ProductsModule } from './products.module.js';
export { ProductsService } from './products.service.js';
