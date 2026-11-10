import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Loading } from '@/ui';

import { useAuth } from './AuthProvider.js';

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading)
    return (
      <div className="page-state">
        <Loading label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
