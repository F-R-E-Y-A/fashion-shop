import { Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import {
  AccountLayout,
  AddressPage,
  AdminUserDetailPage,
  AdminUsersPage,
  ChangePasswordPage,
  ForgotPasswordPage,
  LoginPage,
  ProfilePage,
  RegisterPage,
  RequireAdmin,
  RequireAuth,
  ResetPasswordPage,
  VerifyEmailPage,
} from '@/features/account';
import { CartPage } from '@/features/cart';
import {
  AdminOrderDetailPage,
  AdminOrdersPage,
  CheckoutPage,
  OrderPage,
  OrdersPage,
} from '@/features/checkout';
import { AdminInventoryDetailPage, AdminInventoryPage } from '@/features/inventory';
import {
  AdminCatalogDetailPage,
  AdminCatalogPage,
  AdminCategoriesPage,
  AdminCategoryDetailPage,
  AdminProductsPage,
  CategoryPage,
  HomePage,
  ProductDetailPage,
  ProductListPage,
  SearchPage,
} from '@/features/products';
import {
  AdminVoucherDetailPage,
  AdminVoucherNewPage,
  AdminVouchersPage,
} from '@/features/promotions';
import { Loading } from '@/ui';

import { AdminLayout } from './AdminLayout.js';
import { AuthLayout } from './AuthLayout.js';
import { ScrollManager } from './ScrollManager.js';
import { StoreLayout } from './StoreLayout.js';

function NotFoundPage() {
  return (
    <div className="page-state">
      <div>
        <p className="eyebrow">Lỗi 404</p>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn có thể đã đổi hoặc sản phẩm không còn bán.</p>
        <div className="page-state-actions">
          <Link className="button-primary" to="/">
            Về trang chủ
          </Link>
          <Link className="button-secondary" to="/tim-kiem">
            Tìm sản phẩm
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Duong cu /quan-tri: chuyen han sang /admin, giu query va hash. Chi doi pathname co dinh nen
 * khong mo ra dich ngoai trang; khong dung noi dung quan tri nao truoc RequireAdmin.
 */
function LegacyAdminRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/admin', search, hash }} replace />;
}

export function AppRoutes() {
  return (
    <>
      <ScrollManager />

      <Suspense
        fallback={
          <div className="page-state">
            <Loading />
          </div>
        }
      >
        <Routes>
          <Route element={<StoreLayout />}>
            <Route index element={<HomePage />} />

            <Route path="danh-muc/:slug" element={<CategoryPage />} />
            <Route path="tim-kiem" element={<SearchPage />} />
            <Route path="san-pham" element={<ProductListPage />} />
            <Route path="san-pham/:slug" element={<ProductDetailPage />} />

            <Route path="gio-hang" element={<CartPage />} />

            <Route element={<RequireAuth />}>
              <Route path="thanh-toan" element={<CheckoutPage />} />
              <Route path="thanh-toan/ket-qua" element={<OrderPage />} />
              <Route path="don-hang" element={<Navigate to="/tai-khoan/don-hang" replace />} />
              <Route path="don-hang/:id" element={<OrderPage />} />
              <Route path="tai-khoan" element={<AccountLayout />}>
                <Route index element={<Navigate to="ho-so" replace />} />
                <Route path="ho-so" element={<ProfilePage />} />
                <Route path="dia-chi" element={<AddressPage />} />
                <Route path="don-hang" element={<OrdersPage />} />
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

          {/* Khu quan tri dung URL tieng Anh (ngoai le cua quy uoc duong dan tieng Viet, xem
              docs/shared/code.md). RequireAdmin dat NGOAI AdminLayout: dang khoi phuc phien hay
              khong du quyen thi khong dung khung va khong goi API quan tri. */}
          <Route path="quan-tri" element={<LegacyAdminRedirect />} />
          <Route path="admin" element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route index element={<AdminProductsPage />} />
              <Route path="inventory" element={<AdminInventoryPage />} />
              <Route path="inventory/:id" element={<AdminInventoryDetailPage />} />
              <Route path="categories" element={<AdminCategoriesPage />} />
              <Route path="categories/:id" element={<AdminCategoryDetailPage />} />
              <Route path="products" element={<AdminCatalogPage />} />
              <Route path="products/:id" element={<AdminCatalogDetailPage />} />
              <Route path="vouchers" element={<AdminVouchersPage />} />
              <Route path="vouchers/new" element={<AdminVoucherNewPage />} />
              <Route path="vouchers/:id" element={<AdminVoucherDetailPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="users/:id" element={<AdminUserDetailPage />} />
              <Route path="orders" element={<AdminOrdersPage />} />
              <Route path="orders/:id" element={<AdminOrderDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
