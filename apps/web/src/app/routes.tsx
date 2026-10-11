import { Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';

import {
  AccountLayout,
  AddressPage,
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  ProfilePage,
  RegisterPage,
  RequireAuth,
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
  SearchPage,
} from '@/features/products';
import { Loading } from '@/ui';

import { AdminLayout } from './AdminLayout.js';
import { AuthLayout } from './AuthLayout.js';
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

            <Route path="gio-hang" element={<CartPage />} />

            <Route element={<RequireAuth />}>
              <Route path="tai-khoan" element={<AccountLayout />}>
                <Route index element={<Navigate to="ho-so" replace />} />
                <Route path="ho-so" element={<ProfilePage />} />
                <Route path="dia-chi" element={<AddressPage />} />
                <Route path="doi-mat-khau" element={<ChangePasswordPage />} />
              </Route>
            </Route>

            {/* Duong cu doi-mat-khau tung la trang roi; gio la tab trong tai khoan. */}
            <Route
              path="doi-mat-khau"
              element={<Navigate to="/tai-khoan/doi-mat-khau" replace />}
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* Trang xac thuc dung khung rieng NGANG HANG StoreLayout: full man hinh,
              khong keo header/menu/footer cua hang theo (chi co link thuong hieu ve trang chu). */}
          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="xac-thuc-email" element={<VerifyEmailPage />} />
            <Route path="quen-mat-khau" element={<ForgotPasswordPage />} />
            <Route path="dat-lai-mat-khau" element={<ResetPasswordPage />} />
          </Route>

          <Route path="quan-tri" element={<AdminLayout />}>
            <Route index element={<AdminProductsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
