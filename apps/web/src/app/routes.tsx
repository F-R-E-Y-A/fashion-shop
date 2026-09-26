import { Route, Routes } from 'react-router-dom';

import { LoginPage, RegisterPage } from '@/features/account';
import { AdminProductsPage, ProductDetailPage, ProductListPage } from '@/features/products';

import { AdminLayout } from './AdminLayout.js';
import { StoreLayout } from './StoreLayout.js';

/**
 * Bang duong dan cua toan bo giao dien. DUY NHAT tep nay duoc import cac feature.
 *
 * Them trang moi: lam trang trong feature cua minh, xuat qua index.ts cua feature,
 * roi them mot dong Route o day. Duong dan viet tieng Viet khong dau, noi bang dau gach ngang,
 * giong quy uoc ben may chu.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route index element={<ProductListPage />} />
        <Route path="san-pham/:slug" element={<ProductDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>

      <Route path="quan-tri" element={<AdminLayout />}>
        <Route index element={<AdminProductsPage />} />
      </Route>

      <Route path="*" element={<p className="state">Không tìm thấy trang.</p>} />
    </Routes>
  );
}
