import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Loading } from '@/ui';

import { AdminForbidden } from './admin/AdminForbidden.js';
import styles from './admin/AdminGate.module.css';
import { hasAdminRole } from './admin/user-labels.js';
import { useAuth } from './AuthProvider.js';

/**
 * Cong cua moi trang /admin, dat NGOAI AdminLayout: chua biet phien thi khong dung khung quan tri,
 * khong co vai ADMIN thi khong render Outlet nen khong trang nao goi API /admin/*. Day chi la UX;
 * quyen that do RequireRoles o may chu ep.
 */
export function RequireAdmin() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className={styles.gate}>
        <Loading label="Đang kiểm tra quyền truy cập…" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search + location.hash }}
      />
    );
  }
  if (!hasAdminRole(user)) return <AdminForbidden standalone />;
  return <Outlet />;
}
