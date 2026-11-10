import { lazy } from 'react';

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
export { HomePage } from './pages/HomePage.js';
export { SearchTrigger } from './search/SearchTrigger.js';

// Cac trang con lai tai khi can, de goi dau khong phai chua ca cua hang. Chi HomePage la trang dau tien.
export const AdminProductsPage = lazy(() =>
  import('./pages/AdminProductsPage.js').then((m) => ({ default: m.AdminProductsPage })),
);
export const CategoryPage = lazy(() =>
  import('./pages/CategoryPage.js').then((m) => ({ default: m.CategoryPage })),
);
export const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage.js').then((m) => ({ default: m.ProductDetailPage })),
);
export const ProductListPage = lazy(() =>
  import('./pages/ProductListPage.js').then((m) => ({ default: m.ProductListPage })),
);
export const SearchPage = lazy(() =>
  import('./pages/SearchPage.js').then((m) => ({ default: m.SearchPage })),
);

export const AdminCatalogPage = lazy(() =>
  import('./admin/AdminCatalogPage.js').then((m) => ({ default: m.AdminCatalogPage })),
);
export const AdminCatalogDetailPage = lazy(() =>
  import('./admin/AdminCatalogDetailPage.js').then((m) => ({ default: m.AdminCatalogDetailPage })),
);
export const AdminCategoriesPage = lazy(() =>
  import('./admin/AdminCategoriesPage.js').then((m) => ({ default: m.AdminCategoriesPage })),
);
export const AdminCategoryDetailPage = lazy(() =>
  import('./admin/AdminCategoryDetailPage.js').then((m) => ({
    default: m.AdminCategoryDetailPage,
  })),
);
