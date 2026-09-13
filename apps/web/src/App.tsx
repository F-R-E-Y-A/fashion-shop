import { Route, Routes } from 'react-router-dom';

import { AdminLayout } from './layouts/AdminLayout';
import { StoreLayout } from './layouts/StoreLayout';
import { AdminHomePage } from './pages/AdminHomePage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { ProductListPage } from './pages/ProductListPage';

/**
 * Bang duong dan cua toan bo giao dien.
 *
 * Them trang moi thi them mot dong Route o day va mot tep trong src/pages.
 * Duong dan viet tieng Viet khong dau, noi bang dau gach ngang, giong quy uoc ben may chu.
 */
export function App() {
  return (
    <Routes>
      <Route element={<StoreLayout />}>
        <Route index element={<ProductListPage />} />
        <Route path="san-pham/:slug" element={<ProductDetailPage />} />
      </Route>

      <Route path="quan-tri" element={<AdminLayout />}>
        <Route index element={<AdminHomePage />} />
      </Route>

      <Route path="*" element={<p className="state">Không tìm thấy trang.</p>} />
    </Routes>
  );
}
