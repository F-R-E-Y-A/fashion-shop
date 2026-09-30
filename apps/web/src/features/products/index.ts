/**
 * CUA DUY NHAT cua feature products. app/routes.tsx va feature khac chi import tu day.
 * Chep ca thu muc nay khi lam feature moi: api/, pages/, index.ts.
 */
export {
  type CategoryDetail,
  categoryKeys,
  type CategoryNode,
  getCategories,
  getCategory,
  getProductDetail,
  getRelatedProducts,
  listProducts,
  type ListProductsParams,
  type Product,
  type ProductDetail,
  productKeys,
} from './api/index.js';
export { CategoryMenu } from './components/CategoryMenu.js';
export { AdminProductsPage } from './pages/AdminProductsPage.js';
export { CategoryPage } from './pages/CategoryPage.js';
export { HomePage } from './pages/HomePage.js';
export { ProductDetailPage } from './pages/ProductDetailPage.js';
export { ProductListPage } from './pages/ProductListPage.js';
export { SearchTrigger } from './search/SearchTrigger.js';
