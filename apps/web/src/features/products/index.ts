/**
 * CUA DUY NHAT cua feature products. app/routes.tsx va feature khac chi import tu day.
 * Chep ca thu muc nay khi lam feature moi: api/, pages/, index.ts.
 */
export {
  getProductBySlug,
  listProducts,
  type ListProductsParams,
  type Product,
  productKeys,
} from './api/index.js';
export { AdminProductsPage } from './pages/AdminProductsPage.js';
export { ProductDetailPage } from './pages/ProductDetailPage.js';
export { ProductListPage } from './pages/ProductListPage.js';
