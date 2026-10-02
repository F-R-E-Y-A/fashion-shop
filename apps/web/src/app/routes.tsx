import { Link, Route, Routes } from 'react-router-dom';

import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/features/account';
import { CartPage } from '@/features/cart';
import {
  AdminProductsPage,
  CategoryPage,
  HomePage,
  ProductDetailPage,
  ProductListPage,
} from '@/features/products';

import { AdminLayout } from './AdminLayout.js';
import { ScrollManager } from './ScrollManager.js';
import { StoreLayout } from './StoreLayout.js';

function NotFoundPage() {
  return (
    <div className="state">
      <h1>Không tìm thấy trang</h1>
      <Link to="/">Về trang chủ</Link>
    </div>
  );
}

export function AppRoutes() {
  return (
    <>
      <ScrollManager />
      <Routes>
        <Route element={<StoreLayout />}>
          <Route index element={<HomePage />} />
          <Route path="danh-muc/:slug" element={<CategoryPage />} />
          <Route path="san-pham" element={<ProductListPage />} />
          <Route path="san-pham/:slug" element={<ProductDetailPage />} />
          <Route path="gio-hang" element={<CartPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route path="xac-thuc-email" element={<VerifyEmailPage />} />
          <Route path="quen-mat-khau" element={<ForgotPasswordPage />} />
          <Route path="dat-lai-mat-khau" element={<ResetPasswordPage />} />
          <Route path="doi-mat-khau" element={<ChangePasswordPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="quan-tri" element={<AdminLayout />}>
          <Route index element={<AdminProductsPage />} />
        </Route>
      </Routes>
    </>
  );
}
