import { Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

import {
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/features/account';
import {
  AdminProductsPage,
  CategoryPage,
  HomePage,
  ProductDetailPage,
  ProductListPage,
  SearchPage,
} from '@/features/products';
import { Loading } from '@/ui';

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
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<StoreLayout />}>
            <Route index element={<HomePage />} />
            <Route path="danh-muc/:slug" element={<CategoryPage />} />
            <Route path="tim-kiem" element={<SearchPage />} />
            <Route path="san-pham" element={<ProductListPage />} />
            <Route path="san-pham/:slug" element={<ProductDetailPage />} />
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
      </Suspense>
    </>
  );
}
